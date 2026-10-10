import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile, execFileSync, execSync } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';


const server = new McpServer({
  name: "Splice",
  version: "1.0.0"
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const SCENEDIFF_SOURCE = path.join(__dirname, "native", "scenediff.swift");
const MEDIATOOL_SOURCE = path.join(__dirname, "native", "mediatool.swift");
const execFileAsync = promisify(execFile);
const TEMP_DIR = path.join(__dirname, "temp");



function getAETempDir(): string {
  const homeDir = os.homedir();
  const bridgeDir = path.join(homeDir, 'Documents', 'ae-mcp-bridge');
  
  if (!fs.existsSync(bridgeDir)) {
    fs.mkdirSync(bridgeDir, { recursive: true });
  }
  return bridgeDir;
}




function readResultsFromTempFile(): string {
  try {
    const tempFilePath = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    console.error(`Checking for results at: ${tempFilePath}`);
    
    if (fs.existsSync(tempFilePath)) {
      
      const stats = fs.statSync(tempFilePath);
      console.error(`Result file exists, last modified: ${stats.mtime.toISOString()}`);
      
      const content = fs.readFileSync(tempFilePath, 'utf8');
      console.error(`Result file content length: ${content.length} bytes`);
      
      
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      if (stats.mtime < thirtySecondsAgo) {
        console.error(`WARNING: Result file is older than 30 seconds. After Effects may not be updating results.`);
        return JSON.stringify({ 
          warning: "Result file appears to be stale (not recently updated).",
          message: "This could indicate After Effects is not properly writing results or the Splice bridge isn't running.",
          lastModified: stats.mtime.toISOString(),
          originalContent: content
        });
      }
      
      return content;
    } else {
      console.error(`Result file not found at: ${tempFilePath}`);
      return JSON.stringify({ error: "No results file found. Please run a script in After Effects first." });
    }
  } catch (error) {
    console.error("Error reading results file:", error);
    return JSON.stringify({ error: `Failed to read results: ${String(error)}` });
  }
}


type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function isFailureResult(parsed: any): boolean {
  return !!parsed && (parsed.status === "error" || parsed.success === false || (parsed.error !== undefined && parsed.status !== "success"));
}

async function waitForBridgeResult(expectedCommand: string, commandId: string, timeoutMs: number = 10000, pollMs: number = 100): Promise<{ text: string; isError: boolean }> {
  const start = Date.now();
  const resultPath = path.join(getAETempDir(), 'ae_mcp_result.json');

  while (Date.now() - start < timeoutMs) {
    try {
      const content = fs.readFileSync(resultPath, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed._commandId === commandId) {
        return { text: content, isError: isFailureResult(parsed) };
      }
    } catch {
      // Result missing or still being written
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  return {
    text: JSON.stringify({
      status: "error",
      message: `Timed out after ${timeoutMs / 1000}s waiting for After Effects to run '${expectedCommand}'. ` +
        `Check that After Effects is open with Splice installed (Window > Extensions > Splice). If the command is slow, call get-results shortly.`
    }),
    isError: true
  };
}


function newCommandId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}


// Splice's CEP extension runs an HTTP bridge inside After Effects and records its port here.
// Returns null when it isn't reachable so the caller can fall back to the file bridge.
async function runViaHttpBridge(command: string, args: Record<string, any>, id: string, timeoutMs: number): Promise<{ text: string; isError: boolean } | null> {
  let info: { port: number; token: string };
  try {
    info = JSON.parse(fs.readFileSync(path.join(getAETempDir(), 'http-bridge.json'), 'utf8'));
  } catch {
    return null;
  }
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${info.port}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': info.token },
      body: JSON.stringify({ id, command, args }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError') {
      // AE may still run the command, so don't retry it over the file bridge
      return {
        text: JSON.stringify({
          status: "error",
          message: `Timed out after ${timeoutMs / 1000}s waiting for After Effects to run '${command}'. If the command is slow, call get-results shortly.`
        }),
        isError: true
      };
    }
    console.error(`HTTP bridge unreachable (${error?.cause?.code || error}), using file bridge`);
    return null;
  }
  if (response.status === 401) {
    // Token belongs to an older panel instance
    return null;
  }
  const text = await response.text();
  if (!response.ok) {
    return { text: JSON.stringify({ status: "error", message: `HTTP bridge error ${response.status}: ${text}` }), isError: true };
  }
  try {
    return { text, isError: isFailureResult(JSON.parse(text)) };
  } catch {
    return { text, isError: false };
  }
}


function writeCommandFile(command: string, args: Record<string, any> = {}, id: string = newCommandId()): string {
  const commandFile = path.join(getAETempDir(), 'ae_command.json');
  const commandData = {
    id,
    command,
    args,
    timestamp: new Date().toISOString(),
    status: "pending"
  };
  fs.writeFileSync(commandFile, JSON.stringify(commandData, null, 2));
  console.error(`Command "${command}" (${id}) written to ${commandFile}`);
  return id;
}


async function runBridgeCommand(command: string, args: Record<string, any> = {}, timeoutMs: number = 10000): Promise<ToolResult> {
  try {
    const id = newCommandId();
    const viaHttp = await runViaHttpBridge(command, args, id, timeoutMs);
    if (viaHttp) {
      return { content: [{ type: "text", text: viaHttp.text }], isError: viaHttp.isError };
    }
    clearResultsFile();
    writeCommandFile(command, args, id);
    const result = await waitForBridgeResult(command, id, timeoutMs);
    return { content: [{ type: "text", text: result.text }], isError: result.isError };
  } catch (error) {
    return { content: [{ type: "text", text: `Error running '${command}': ${String(error)}` }], isError: true };
  }
}


function clearResultsFile(): void {
  try {
    const resultFile = path.join(getAETempDir(), 'ae_mcp_result.json');
    
    
    const resetData = {
      status: "waiting",
      message: "Waiting for new result from After Effects...",
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(resultFile, JSON.stringify(resetData, null, 2));
    console.error(`Results file cleared at ${resultFile}`);
  } catch (error) {
    console.error("Error clearing results file:", error);
  }
}

function uniqueExistingDirs(pathsToCheck: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const p of pathsToCheck) {
    if (!p) {
      continue;
    }
    const normalized = path.normalize(p);
    if (seen.has(normalized)) {
      continue;
    }
    if (fs.existsSync(normalized)) {
      try {
        if (fs.statSync(normalized).isDirectory()) {
          seen.add(normalized);
          result.push(normalized);
        }
      } catch {
        
      }
    }
  }

  return result;
}

function getDefaultPresetRoots(): string[] {
  const home = os.homedir();
  const appData = process.env.APPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";

  const roots = [
    path.join(home, "Documents", "Adobe"),
    path.join(home, "Documents", "Adobe", "After Effects"),
    path.join(home, "Documents", "Adobe", "After Effects User Presets"),
    path.join(appData, "Adobe", "After Effects"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2026", "Support Files", "Presets"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2025", "Support Files", "Presets"),
    path.join(programFiles, "Adobe", "Adobe After Effects 2024", "Support Files", "Presets"),
  ];

  return uniqueExistingDirs(roots);
}

function collectPresetFiles(
  roots: string[],
  recursive: boolean,
  query?: string,
  maxResults: number = 500,
  maxDepth: number = 10,
): Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> {
  const results: Array<{ path: string; name: string; directory: string; size: number; modifiedAt: string }> = [];
  const loweredQuery = query ? query.toLowerCase() : "";

  function walk(currentDir: string, depth: number) {
    if (results.length >= maxResults) {
      return;
    }
    if (depth > maxDepth) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) {
        return;
      }

      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (recursive) {
          walk(entryPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!entry.name.toLowerCase().endsWith(".ffx")) {
        continue;
      }

      if (loweredQuery && !entry.name.toLowerCase().includes(loweredQuery) && !entryPath.toLowerCase().includes(loweredQuery)) {
        continue;
      }

      try {
        const stat = fs.statSync(entryPath);
        results.push({
          path: entryPath,
          name: entry.name,
          directory: currentDir,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        
      }
    }
  }

  for (const root of roots) {
    if (results.length >= maxResults) {
      break;
    }
    walk(root, 0);
  }

  return results;
}


server.resource(
  "compositions",
  "aftereffects://compositions",
  async (uri) => {
    
    const result = await runBridgeCommand("listCompositions", {});

    return {
      contents: [{
        uri: uri.href,
        mimeType: "application/json",
        text: result.content[0].text
      }]
    };
  }
);


server.tool(
  "run-script",
  "Run a predefined After Effects script by name and return its result. Read: getProjectInfo, listCompositions (returns compIndex for each comp), getLayerInfo (pass compIndex or compName in parameters; defaults to the active comp). Write: createTextLayer, createShapeLayer, createSolidLayer, setLayerProperties and others in the allowlist.",
  {
    script: z.string().describe("Name of the predefined script to run"),
    parameters: z.record(z.any()).optional().describe("Optional parameters for the script")
  },
  async ({ script, parameters = {} }) => {
    
    const allowedScripts = [
      "listCompositions", 
      "getProjectInfo",
      "listProjectItems",
      "getLayerInfo", 
      "createComposition",
      "createTextLayer",
      "createShapeLayer",
      "createSolidLayer",
      "createAdjustmentLayer",
      "centerLayers",
      "getLayerClipFrames",
      "setLayerProperties",
      "setLayerKeyframe",
      "setLayerExpression",
      "applyEffect",
      "applyEffectTemplate",
      "listLayerEffects",
      "listAvailableEffects",
      "setEffectProperty",
      "setEffectKeyframe",
      "applyLayerPreset",
      "removeLayerEffect",
      "addMarker",
      "setLayerAudioLevels",
      "getLayerAudioInfo",
      "addMarkersFromArray",
      "getMarkers",
      "cutToMarkers",
      "arrangeClips",
      "bridgeTestEffects"
    ];
    
    if (!allowedScripts.includes(script)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Script "${script}" is not allowed. Allowed scripts are: ${allowedScripts.join(", ")}`
          }
        ],
        isError: true
      };
    }

    return runBridgeCommand(script, parameters, 15000);
  }
);


server.tool(
  "execute-jsx",
  "Run your own ExtendScript in After Effects, for anything the other tools don't cover. The code is the body of a function: use `return` to send back a value (plain objects, arrays, strings and numbers; AE objects come back as {_type, name, index}) and `log(...)` for extra output lines. The whole script is one undo step. ExtendScript is ES3: no let/const, arrow functions, template literals or Array.map/forEach. Collections like app.project.items and comp.layers are 1-based. Never call alert/confirm/prompt or open dialogs (they block After Effects), and don't call beginUndoGroup/endUndoGroup yourself. Prefer the dedicated tools when one fits, and read state first (e.g. with a read-only script) before changing it.",
  {
    code: z.string().min(1).describe("ExtendScript function body to run, e.g. `var comp = app.project.activeItem; return comp.name;`"),
    undoName: z.string().max(60).optional().describe("Short label for the undo step, shown as 'Claude: <label>' in Edit > Undo"),
    timeoutSeconds: z.number().min(1).max(600).optional().describe("How long to wait for After Effects (default 30)")
  },
  async ({ code, undoName, timeoutSeconds = 30 }) => {
    return runBridgeCommand("executeJsx", { code, undoName }, timeoutSeconds * 1000);
  }
);


server.tool(
  "get-results",
  "Get results from the last script executed in After Effects",
  {},
  async () => {
    try {
      const result = readResultsFromTempFile();
      return {
        content: [
          {
            type: "text",
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting results: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);


server.prompt(
  "list-compositions",
  "List compositions in the current After Effects project",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "Please list all compositions in the current After Effects project."
        }
      }]
    };
  }
);

server.prompt(
  "analyze-composition",
  {
    compositionName: z.string().describe("Name of the composition to analyze")
  },
  (args) => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please analyze the composition named "${args.compositionName}" in the current After Effects project. Provide details about its duration, frame rate, resolution, and layers.`
        }
      }]
    };
  }
);


server.prompt(
  "create-composition",
  "Create a new composition with specified settings",
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Please create a new composition with custom settings. You can specify parameters like name, width, height, frame rate, etc.`
        }
      }]
    };
  }
);


server.tool(
  "get-help",
  "Get help on using the After Effects MCP integration",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects MCP Integration Help

To use this integration with After Effects, follow these steps:

1. **Install Splice**
   - Run \`node install.js\` in the Splice repo, then restart After Effects
   - Splice's hidden bridge extension starts with After Effects and receives commands on 127.0.0.1

2. **Open a project in After Effects**

3. **Open the chat panel (optional)**
   - Window > Extensions > Splice docks Claude next to your comps

4. **Run commands through MCP**
   - Every tool waits for After Effects and returns its result directly
   - Each write command is a single undo step in After Effects (Cmd/Ctrl+Z)
   - Target comps by \`compName\`, or by the \`compIndex\` that listCompositions returns

5. **If a command times out**
   - Call \`get-results\` a moment later to read the latest result

Available scripts:
- getProjectInfo: Information about the current project
- listCompositions: List all compositions in the project
- getLayerInfo: Information about layers in the active composition
- createComposition: Create a new composition
- createTextLayer: Create a new text layer
- createShapeLayer: Create a new shape layer
- createSolidLayer: Create a new solid layer
- createAdjustmentLayer: Create a new adjustment layer
- centerLayers: Center one, selected, or all layers in a composition
- getLayerClipFrames: Get clip start/end frames and source frame range for a layer
- setLayerProperties: Set properties for a layer
- setLayerKeyframe: Set a keyframe for a layer property
- setLayerExpression: Set an expression for a layer property
- applyEffect: Apply an effect to a layer
- applyEffectTemplate: Apply a predefined effect template to a layer
- listLayerEffects: List effects on a layer (optionally with all properties)
- listAvailableEffects: List all effects available in this After Effects installation
- setEffectProperty: Edit any property on an effect by name/index/path
- setEffectKeyframe: Add/edit keyframes for effect properties with graph/easing controls
- applyLayerPreset: Apply an .ffx preset file to a layer
- removeLayerEffect: Remove one effect (or all effects) from a layer
- addMarker: Add a layer or composition marker at a specified time
- setLayerAudioLevels: Set audio levels (dB) on an audio/AV layer, optionally with keyframes
- getLayerAudioInfo: Get audio metadata, source file path, existing markers, and audio level keyframes for a layer
- addMarkersFromArray: Add multiple markers at once from an array of {timeInSeconds, comment, duration, label} objects
- listProjectItems: Every project item with type, folder, footage file paths and where it's used

Media on disk (scenepacks), macOS:
- browse-media: List video files in a folder with duration, resolution, fps and codec
- preview-media: Contact sheet of frames from a file on disk, no import needed
- detect-media-shots: Shot list (hard cuts) for a file on disk, with a preview of each shot
- import-clips: Import files and place trimmed clips in a comp, then check them for hidden cuts

Anything else:
- execute-jsx: Run your own ExtendScript (a function body; \`return\` a value, \`log()\` extra lines) as one undo step

Effect Templates:
- gaussian-blur: Simple Gaussian blur effect
- directional-blur: Motion blur in a specific direction
- color-balance: Adjust hue, lightness, and saturation
- brightness-contrast: Basic brightness and contrast adjustment
- curves: Advanced color adjustment using curves
- glow: Add a glow effect to elements
- drop-shadow: Add a customizable drop shadow
- cinematic-look: Combination of effects for a cinematic appearance
- text-pop: Effects to make text stand out (glow and shadow)

Note: The auto-running panel can be left open in After Effects to continuously listen for commands from external applications.`
        }
      ]
    };
  }
);


server.tool(
  "create-composition",
  "Create a new composition in After Effects with specified parameters",
  {
    name: z.string().describe("Name of the composition"),
    width: z.number().int().positive().describe("Width of the composition in pixels"),
    height: z.number().int().positive().describe("Height of the composition in pixels"),
    pixelAspect: z.number().positive().optional().describe("Pixel aspect ratio (default: 1.0)"),
    duration: z.number().positive().optional().describe("Duration in seconds (default: 10.0)"),
    frameRate: z.number().positive().optional().describe("Frame rate in frames per second (default: 30.0)"),
    backgroundColor: z.object({
      r: z.number().int().min(0).max(255),
      g: z.number().int().min(0).max(255),
      b: z.number().int().min(0).max(255)
    }).optional().describe("Background color of the composition (RGB values 0-255)")
  },
  async (params) => runBridgeCommand("createComposition", params, 10000)
);

server.tool(
  "create-adjustment-layer",
  "Create an adjustment layer in the specified composition (or active comp).",
  {
    compName: z.string().optional().describe("Composition name. If omitted, active composition is used."),
    name: z.string().optional().describe("Layer name (default: Adjustment Layer)."),
    position: z.array(z.number()).optional().describe("Layer position [x,y] or [x,y,z]."),
    size: z.array(z.number()).optional().describe("Layer size [width,height]. Defaults to comp dimensions."),
    startTime: z.number().optional().describe("Layer start time in seconds."),
    duration: z.number().positive().optional().describe("Layer duration in seconds."),
  },
  async (parameters) => runBridgeCommand("createAdjustmentLayer", parameters, 10000)
);

server.tool(
  "center-layers",
  "Center one layer, selected layers, or all layers in a composition.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index when centering a single layer."),
    layerName: z.string().optional().describe("Target layer name when centering a single layer."),
    selectedOnly: z.boolean().optional().describe("Center only selected layers in the composition."),
    allLayers: z.boolean().optional().describe("Center all layers in the composition."),
  },
  async (parameters) => runBridgeCommand("centerLayers", parameters, 10000)
);

server.tool(
  "get-layer-clip-frames",
  "Get a layer's clip start/end frames, source frame range, and duration in frames.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name if not using layerIndex."),
  },
  async (parameters) => runBridgeCommand("getLayerClipFrames", parameters, 10000)
);




const LayerIdentifierSchema = {
  compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
  compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
  layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition.")
};



const KeyframeValueSchema = z.any().describe("The value for the keyframe (e.g., [x,y] for Position, [w,h] for Scale, angle for Rotation, percentage for Opacity)");


server.tool(
  "setLayerKeyframe", 
  "Set a keyframe for a specific layer property at a given time.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to keyframe (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    timeInSeconds: z.number().describe("The time (in seconds) for the keyframe."),
    value: KeyframeValueSchema
  },
  async (parameters) => runBridgeCommand("setLayerKeyframe", parameters, 10000)
);


server.tool(
  "setLayerExpression", 
  "Set or remove an expression for a specific layer property.",
  {
    ...LayerIdentifierSchema, 
    propertyName: z.string().describe("Name of the property to apply the expression to (e.g., 'Position', 'Scale', 'Rotation', 'Opacity')."),
    expressionString: z.string().describe("The JavaScript expression string. Provide an empty string (\"\") to remove the expression.")
  },
  async (parameters) => runBridgeCommand("setLayerExpression", parameters, 10000)
);





server.tool(
  "test-animation",
  "Test animation functionality in After Effects",
  {
    operation: z.enum(["keyframe", "expression"]).describe("The animation operation to test"),
    compIndex: z.number().int().positive().describe("Composition index (usually 1)"),
    layerIndex: z.number().int().positive().describe("Layer index (usually 1)")
  },
  async (params) => {
    try {
      
      const timestamp = new Date().getTime();
      const tempFile = path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), `ae_test_${timestamp}.jsx`);
      
      
      let scriptContent = "";
      if (params.operation === "keyframe") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Opacity");
            var time = 1; // 1 second
            var value = 25; // 25% opacity
            prop.setValueAtTime(time, value);
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added keyframe at time " + time + " with value " + value);
            resultFile.close();
            alert("Test successful: Added opacity keyframe at " + time + "s with value " + value + "%");
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      } else if (params.operation === "expression") {
        scriptContent = `
          try {
            var comp = app.project.items[${params.compIndex}];
            var layer = comp.layers[${params.layerIndex}];
            var prop = layer.property("Transform").property("Position");
            var expression = "wiggle(3, 30)";
            prop.expression = expression;
            var resultFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_result.txt').replace(/\\/g, '\\\\')}");
            resultFile.open("w");
            resultFile.write("SUCCESS: Added expression: " + expression);
            resultFile.close();
            alert("Test successful: Added position expression: " + expression);
          } catch (e) {
            var errorFile = new File("${path.join(process.env.TEMP || process.env.TMP || os.tmpdir(), 'ae_test_error.txt').replace(/\\/g, '\\\\')}");
            errorFile.open("w");
            errorFile.write("ERROR: " + e.toString());
            errorFile.close();
            
            alert("Test failed: " + e.toString());
          }
        `;
      }
      
      
      fs.writeFileSync(tempFile, scriptContent);
      console.error(`Written test script to: ${tempFile}`);
      
      
      return {
        content: [
          {
            type: "text",
            text: `I've created a direct test script for the ${params.operation} operation.

Please run this script manually in After Effects:
1. In After Effects, go to File > Scripts > Run Script File...
2. Navigate to: ${tempFile}
3. You should see an alert confirming the result.

This bypasses the bridge and will directly modify the specified layer.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error creating test script: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);





server.tool(
  "apply-effect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().optional().describe("Generic effect identifier. Can be either exact display name or matchName."),
    effectIdentifier: z.string().optional().describe("Alias for effect. Can be either exact display name or matchName."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectCategory: z.string().optional().describe("Optional category for filtering effects."),
    presetPath: z.string().optional().describe("Optional path to an effect preset file (.ffx)."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => runBridgeCommand("applyEffect", parameters, 10000)
);

server.tool(
  "add-any-effect",
  "Add any After Effects effect to a layer by matchName or display name.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().describe("Effect identifier. Prefer matchName for reliability (e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters to set immediately after adding the effect.")
  },
  async (parameters) => {
    return runBridgeCommand("applyEffect", {
      compIndex: parameters.compIndex,
      compName: parameters.compName,
      layerIndex: parameters.layerIndex,
      effect: parameters.effect,
      effectSettings: parameters.effectSettings || {}
    });
  }
);


server.tool(
  "apply-effect-template",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => runBridgeCommand("applyEffectTemplate", parameters, 10000)
);

server.tool(
  "list-layer-effects",
  "List effects on a layer, with optional recursive property details.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    includeProperties: z.boolean().optional().describe("Include effect property trees (default: false)."),
    includeValues: z.boolean().optional().describe("Include current values for non-group properties (default: false)."),
    maxDepth: z.number().int().positive().max(8).optional().describe("Maximum property recursion depth when includeProperties is true (default: 2).")
  },
  async (parameters) => runBridgeCommand("listLayerEffects", parameters, 10000)
);

server.tool(
  "list-available-effects",
  "List all effects available in this After Effects installation, with optional text filter.",
  {
    query: z.string().optional().describe("Optional text filter. Matches effect name, matchName, and category."),
    includeObsolete: z.boolean().optional().describe("Include obsolete effects (default: false)."),
    maxResults: z.number().int().positive().max(20000).optional().describe("Maximum results to return (default: 5000).")
  },
  async (parameters) => runBridgeCommand("listAvailableEffects", parameters, 30000)
);

server.tool(
  "set-effect-property",
  "Set or keyframe any property on an existing layer effect using name/index/path.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().optional().describe("Value to assign to the target property."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time using value."),
    expressionString: z.string().optional().describe("Optional expression string to set on the target property."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls applied to the keyframe at timeInSeconds.")
  },
  async (parameters) => runBridgeCommand("setEffectProperty", parameters, 10000)
);

server.tool(
  "set-effect-keyframe",
  "Set an effect property keyframe with optional graph interpolation and easy-ease controls.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effectIndex: z.number().int().positive().optional().describe("1-based index of the effect in the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to target."),
    effectMatchName: z.string().optional().describe("Internal matchName of the effect to target."),
    propertyPath: z.array(z.union([z.string(), z.number().int().positive()])).optional().describe("Path from effect root to target property, e.g. ['Compositing Options', 'Effect Opacity'] or [3, 1]."),
    propertyName: z.string().optional().describe("Fallback target property name or matchName."),
    propertyIndex: z.number().int().positive().optional().describe("Fallback target property index under the effect root."),
    keyframeIndex: z.number().int().positive().optional().describe("Optional keyframe index to edit graph/value directly without resolving by time."),
    value: z.any().describe("Value to set at the keyframe time."),
    timeInSeconds: z.number().optional().describe("Time of the keyframe in seconds."),
    keyframeOptions: z.object({
      easyEase: z.boolean().optional().describe("Apply Easy Ease to the keyframe."),
      easyEaseInfluence: z.number().min(0.1).max(100).optional().describe("Influence used when easyEase is true (default: 33.333)."),
      interpolationIn: z.enum(["linear", "bezier", "hold"]).optional().describe("Incoming interpolation type."),
      interpolationOut: z.enum(["linear", "bezier", "hold"]).optional().describe("Outgoing interpolation type."),
      temporalContinuous: z.boolean().optional().describe("Enable or disable temporal continuity."),
      temporalAutoBezier: z.boolean().optional().describe("Enable or disable temporal auto-bezier."),
      roving: z.boolean().optional().describe("Set roving keyframe when supported by the property."),
      easeIn: z.union([
        z.object({
          speed: z.number().optional().describe("Incoming temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Incoming temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension incoming speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension incoming influence (0.1-100).")
        })).min(1)
      ]).optional(),
      easeOut: z.union([
        z.object({
          speed: z.number().optional().describe("Outgoing temporal speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Outgoing temporal influence (0.1-100).")
        }),
        z.array(z.object({
          speed: z.number().optional().describe("Per-dimension outgoing speed."),
          influence: z.number().min(0.1).max(100).optional().describe("Per-dimension outgoing influence (0.1-100).")
        })).min(1)
      ]).optional(),
      spatialTangentsIn: z.array(z.number()).optional().describe("Incoming spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialTangentsOut: z.array(z.number()).optional().describe("Outgoing spatial tangent array for spatial properties (e.g., [x,y] or [x,y,z])."),
      spatialContinuous: z.boolean().optional().describe("Enable or disable spatial continuity on spatial properties."),
      spatialAutoBezier: z.boolean().optional().describe("Enable or disable spatial auto-bezier on spatial properties.")
    }).optional().describe("Optional graph/easing controls for the created keyframe.")
  },
  async (parameters) => runBridgeCommand("setEffectKeyframe", parameters, 10000)
);

server.tool(
  "list-presets",
  "List available After Effects .ffx presets from common or provided folders.",
  {
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search for presets. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 500)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 500;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, undefined, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error listing presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "search-presets",
  "Search After Effects .ffx presets by name or path.",
  {
    query: z.string().describe("Search text to match in preset filename or full path."),
    presetRoots: z.array(z.string()).optional().describe("Optional absolute directories to search. Defaults to common Adobe preset locations."),
    recursive: z.boolean().optional().describe("Recursively search subdirectories (default: true)."),
    maxResults: z.number().int().positive().max(2000).optional().describe("Maximum number of preset files to return (default: 200)."),
    maxDepth: z.number().int().positive().max(25).optional().describe("Maximum directory depth when recursive is true (default: 10).")
  },
  async (parameters) => {
    try {
      const roots = uniqueExistingDirs(parameters.presetRoots && parameters.presetRoots.length > 0
        ? parameters.presetRoots
        : getDefaultPresetRoots());
      const recursive = parameters.recursive !== undefined ? parameters.recursive : true;
      const maxResults = parameters.maxResults || 200;
      const maxDepth = parameters.maxDepth || 10;

      const presets = collectPresetFiles(roots, recursive, parameters.query, maxResults, maxDepth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "success",
              query: parameters.query,
              searchedRoots: roots,
              recursive,
              maxResults,
              resultCount: presets.length,
              presets
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching presets: ${String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

server.tool(
  "apply-preset",
  "Apply an After Effects .ffx preset file to a layer.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    presetPath: z.string().describe("Absolute path to the .ffx preset file."),
  },
  async (parameters) => runBridgeCommand("applyLayerPreset", parameters, 10000)
);




server.tool(
  "mcp_aftereffects_applyEffect",
  "Apply an effect to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    effect: z.string().optional().describe("Generic effect identifier. Can be either exact display name or matchName."),
    effectIdentifier: z.string().optional().describe("Alias for effect. Can be either exact display name or matchName."),
    effectName: z.string().optional().describe("Display name of the effect to apply (e.g., 'Gaussian Blur')."),
    effectMatchName: z.string().optional().describe("After Effects internal name for the effect (more reliable, e.g., 'ADBE Gaussian Blur 2')."),
    effectSettings: z.record(z.any()).optional().describe("Optional parameters for the effect (e.g., { 'Blurriness': 25 }).")
  },
  async (parameters) => runBridgeCommand("applyEffect", parameters, 10000)
);


server.tool(
  "mcp_aftereffects_applyEffectTemplate",
  "Apply a predefined effect template to a layer in After Effects",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based index of the target layer within the composition."),
    templateName: z.enum([
      "gaussian-blur", 
      "directional-blur", 
      "color-balance", 
      "brightness-contrast",
      "curves",
      "glow",
      "drop-shadow",
      "cinematic-look",
      "text-pop"
    ]).describe("Name of the effect template to apply."),
    customSettings: z.record(z.any()).optional().describe("Optional custom settings to override defaults.")
  },
  async (parameters) => runBridgeCommand("applyEffectTemplate", parameters, 10000)
);


server.tool(
  "mcp_aftereffects_get_effects_help",
  "Get help on using After Effects effects",
  {},
  async () => {
    return {
      content: [
        {
          type: "text",
          text: `# After Effects Effects Help

## Common Effect Match Names
These are internal names used by After Effects that can be used with the \`effectMatchName\` parameter:

### Blur & Sharpen
- Gaussian Blur: "ADBE Gaussian Blur 2"
- Camera Lens Blur: "ADBE Camera Lens Blur"
- Directional Blur: "ADBE Directional Blur"
- Radial Blur: "ADBE Radial Blur"
- Smart Blur: "ADBE Smart Blur"
- Unsharp Mask: "ADBE Unsharp Mask"

### Color Correction
- Brightness & Contrast: "ADBE Brightness & Contrast 2"
- Color Balance: "ADBE Color Balance (HLS)"
- Color Balance (RGB): "ADBE Pro Levels2"
- Curves: "ADBE CurvesCustom"
- Exposure: "ADBE Exposure2"
- Hue/Saturation: "ADBE HUE SATURATION"
- Levels: "ADBE Pro Levels2"
- Vibrance: "ADBE Vibrance"

### Stylistic
- Glow: "ADBE Glow"
- Drop Shadow: "ADBE Drop Shadow"
- Bevel Alpha: "ADBE Bevel Alpha"
- Noise: "ADBE Noise"
- Fractal Noise: "ADBE Fractal Noise"
- CC Particle World: "CC Particle World"
- CC Light Sweep: "CC Light Sweep"

## Effect Templates
The following predefined effect templates are available:

- \`gaussian-blur\`: Simple Gaussian blur effect
- \`directional-blur\`: Motion blur in a specific direction
- \`color-balance\`: Adjust hue, lightness, and saturation
- \`brightness-contrast\`: Basic brightness and contrast adjustment
- \`curves\`: Advanced color adjustment using curves
- \`glow\`: Add a glow effect to elements
- \`drop-shadow\`: Add a customizable drop shadow
- \`cinematic-look\`: Combination of effects for a cinematic appearance
- \`text-pop\`: Effects to make text stand out (glow and shadow)

## Example Usage
To apply a Gaussian blur effect:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "effectMatchName": "ADBE Gaussian Blur 2",
  "effectSettings": {
    "Blurriness": 25
  }
}
\`\`\`

To apply the "cinematic-look" template:

\`\`\`json
{
  "compIndex": 1,
  "layerIndex": 1,
  "templateName": "cinematic-look"
}
\`\`\`
`
        }
      ]
    };
  }
);


server.tool(
  "run-bridge-test",
  "Run the bridge test effects script to verify communication and apply test effects",
  {},
  async () => runBridgeCommand("bridgeTestEffects", {}, 10000)
);

server.tool(
  "remove-effect",
  "Remove one specific effect (or all effects) from a layer.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    effectIndex: z.number().int().positive().optional().describe("1-based effect index within the layer's Effects group."),
    effectName: z.string().optional().describe("Display name of the effect to remove."),
    effectMatchName: z.string().optional().describe("Internal match name of the effect to remove."),
    removeAll: z.boolean().optional().describe("If true, remove all effects from the layer."),
  },
  async (parameters) => runBridgeCommand("removeLayerEffect", parameters, 10000)
);

server.tool(
  "add-marker",
  "Add a marker to a layer or composition at a specified time. Markers can include a comment, label color, chapter name, URL and duration.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for a composition marker."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    timeInSeconds: z.number().optional().describe("Time in seconds where the marker is placed. Defaults to current time."),
    comment: z.string().optional().describe("Marker comment / label text."),
    duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
    chapter: z.string().optional().describe("Chapter name associated with the marker."),
    url: z.string().optional().describe("URL to open when the marker is reached (for web export)."),
    label: z.number().int().min(0).max(16).optional().describe("Label color index (0 = none, 1-16 map to AE label colors)."),
  },
  async (parameters) => runBridgeCommand("addMarker", parameters, 10000)
);

server.tool(
  "set-audio-levels",
  "Set the audio levels (in dB) for an audio or AV layer. Supports per-channel control and optional keyframing.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().describe("1-based layer index."),
    level: z.number().optional().describe("Level in dB applied to both left and right channels (e.g. 0 = unity, -6 = half volume, -96 = silence)."),
    leftLevel: z.number().optional().describe("Left channel level in dB (overrides level for left channel)."),
    rightLevel: z.number().optional().describe("Right channel level in dB (overrides level for right channel)."),
    timeInSeconds: z.number().optional().describe("If provided, sets a keyframe at this time instead of a static value."),
  },
  async (parameters) => runBridgeCommand("setLayerAudioLevels", parameters, 10000)
);

function analyzeWavAmplitudes(filePath: string, numPoints: number = 200): {
  duration: number;
  sampleRate: number;
  channels: number;
  amplitudes: number[];
  peakTimes: number[];
  waveformPoints: Array<{ time: number; amplitude: number }>;
} | null {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 4).toString("ascii") !== "RIFF") return null;
    if (buf.slice(8, 12).toString("ascii") !== "WAVE") return null;

    let offset = 12;
    let fmtChannels = 0, fmtSampleRate = 0, fmtBitsPerSample = 0, fmtAudioFormat = 0;
    let dataOffset = -1, dataSize = 0;

    while (offset < buf.length - 8) {
      const chunkId = buf.slice(offset, offset + 4).toString("ascii");
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === "fmt ") {
        fmtAudioFormat  = buf.readUInt16LE(offset + 8);
        fmtChannels     = buf.readUInt16LE(offset + 10);
        fmtSampleRate   = buf.readUInt32LE(offset + 12);
        fmtBitsPerSample = buf.readUInt16LE(offset + 22);
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize   = chunkSize;
      }
      offset += 8 + chunkSize + (chunkSize % 2 !== 0 ? 1 : 0);
    }

    if (dataOffset < 0 || fmtAudioFormat !== 1 || fmtChannels === 0) return null;

    const bytesPerSample = fmtBitsPerSample / 8;
    const totalSamples   = Math.floor(dataSize / (bytesPerSample * fmtChannels));
    const duration       = totalSamples / fmtSampleRate;
    const samplesPerPoint = Math.max(1, Math.floor(totalSamples / numPoints));
    const maxVal = fmtBitsPerSample === 8 ? 128 : Math.pow(2, fmtBitsPerSample - 1);

    const amplitudes: number[] = [];
    const waveformPoints: Array<{ time: number; amplitude: number }> = [];

    for (let i = 0; i < numPoints; i++) {
      let maxAmp = 0;
      const startSample = i * samplesPerPoint;
      const endSample   = Math.min(startSample + samplesPerPoint, totalSamples);
      for (let s = startSample; s < endSample; s++) {
        for (let c = 0; c < fmtChannels; c++) {
          const bytePos = dataOffset + (s * fmtChannels + c) * bytesPerSample;
          if (bytePos + bytesPerSample > buf.length) continue;
          let sample = 0;
          if (fmtBitsPerSample === 16)       sample = Math.abs(buf.readInt16LE(bytePos));
          else if (fmtBitsPerSample === 8)   sample = Math.abs(buf.readUInt8(bytePos) - 128);
          else if (fmtBitsPerSample === 24) {
            const lo = buf.readUInt16LE(bytePos);
            const hi = buf.readInt8(bytePos + 2);
            sample = Math.abs((hi << 16) | lo);
          }
          else if (fmtBitsPerSample === 32)  sample = Math.abs(buf.readInt32LE(bytePos));
          if (sample > maxAmp) maxAmp = sample;
        }
      }
      const norm = maxAmp / maxVal;
      const t    = (i / numPoints) * duration;
      amplitudes.push(norm);
      waveformPoints.push({ time: parseFloat(t.toFixed(4)), amplitude: parseFloat(norm.toFixed(4)) });
    }

    const maxAmplitude = Math.max(...amplitudes);
    const threshold = maxAmplitude * 0.6;
    const minGapSamples = Math.floor(numPoints * 0.03);
    const peakTimes: number[] = [];
    let lastPeakIdx = -minGapSamples;

    for (let i = 1; i < amplitudes.length - 1; i++) {
      if (
        amplitudes[i] > threshold &&
        amplitudes[i] >= amplitudes[i - 1] &&
        amplitudes[i] >= amplitudes[i + 1] &&
        i - lastPeakIdx >= minGapSamples
      ) {
        peakTimes.push(parseFloat(waveformPoints[i].time.toFixed(3)));
        lastPeakIdx = i;
      }
    }

    return { duration, sampleRate: fmtSampleRate, channels: fmtChannels, amplitudes, peakTimes, waveformPoints };
  } catch {
    return null;
  }
}

server.tool(
  "get-audio-info",
  "Get audio metadata, source file path, existing markers, and audio level keyframes for a layer in After Effects.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
  },
  async (parameters) => runBridgeCommand("getLayerAudioInfo", parameters, 10000)
);

server.tool(
  "analyze-audio-waveform",
  "Analyze a WAV audio file to extract waveform amplitude data and detect peaks/transients. First call get-audio-info to retrieve the sourceFilePath, then pass it here. Returns normalized amplitude values (0-1) at evenly spaced time intervals plus an array of peak times where transients are detected.",
  {
    filePath: z.string().describe("Absolute path to the WAV audio file (obtained from get-audio-info sourceFilePath)."),
    numPoints: z.number().int().positive().optional().describe("Number of amplitude samples to return (default: 200). Higher = more detail."),
  },
  async ({ filePath, numPoints = 200 }) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: `File not found: ${filePath}` }) }], isError: true };
      }
      const result = analyzeWavAmplitudes(filePath, numPoints);
      if (!result) {
        return { content: [{ type: "text", text: JSON.stringify({ status: "error", message: "Could not parse audio file. Only uncompressed PCM WAV files are supported. For other formats, convert to WAV first." }) }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify({
          status: "success",
          filePath,
          duration: result.duration,
          sampleRate: result.sampleRate,
          channels: result.channels,
          numPoints: numPoints,
          peakCount: result.peakTimes.length,
          peakTimes: result.peakTimes,
          waveformPoints: result.waveformPoints
        }, null, 2) }]
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Error analyzing waveform: ${String(error)}` }], isError: true };
    }
  }
);

server.tool(
  "add-markers-bulk",
  "Add multiple layer or composition markers at once. Use this after analyze-audio-waveform to place markers at detected peaks, or to add any set of markers in a single call.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Folders and footage count too, so prefer compName. Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    markerType: z.enum(["layer", "comp"]).optional().describe("'layer' (default) or 'comp' for composition-level markers."),
    layerIndex: z.number().int().positive().optional().describe("Target layer index (required for layer markers)."),
    layerName: z.string().optional().describe("Target layer name (alternative to layerIndex)."),
    markers: z.array(z.object({
      timeInSeconds: z.number().describe("Time in seconds for this marker."),
      comment: z.string().optional().describe("Marker comment text."),
      duration: z.number().optional().describe("Marker duration in seconds (0 = point marker)."),
      label: z.number().int().min(0).max(16).optional().describe("Label color index (0-16)."),
      chapter: z.string().optional().describe("Chapter name."),
      url: z.string().optional().describe("URL link."),
    })).describe("Array of markers to add."),
  },
  async (parameters) => runBridgeCommand("addMarkersFromArray", parameters, 10000)
);


function getFramesDir(): string {
  const dir = path.join(getAETempDir(), "frames");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// saveFrameToPng can finish writing after the bridge returns, so wait for each file to settle
async function waitForStableFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  let lastSize = -1;
  while (Date.now() - start < timeoutMs) {
    try {
      const size = fs.statSync(filePath).size;
      if (size > 0 && size === lastSize) {
        return true;
      }
      lastSize = size;
    } catch {
      // Not written yet
    }
    await new Promise(r => setTimeout(r, 150));
  }
  return false;
}

// Downscales with macOS sips to keep image tokens low; elsewhere the PNG is sent as is
function removeFrameFiles(pngPath: string): void {
  for (const p of [pngPath, pngPath.replace(/\.png$/i, ".jpg"), pngPath.replace(/\.png$/i, ".bmp")]) {
    fs.rmSync(p, { force: true });
  }
}

function loadFrameImage(pngPath: string, maxSize: number): { data: string; mimeType: string } {
  if (process.platform === "darwin") {
    const jpgPath = pngPath.replace(/\.png$/i, ".jpg");
    try {
      execFileSync("sips", ["-Z", String(maxSize), "-s", "format", "jpeg", "-s", "formatOptions", "75", pngPath, "--out", jpgPath], { stdio: "ignore" });
      return { data: fs.readFileSync(jpgPath).toString("base64"), mimeType: "image/jpeg" };
    } catch {
      // Fall back to the full PNG
    }
  }
  return { data: fs.readFileSync(pngPath).toString("base64"), mimeType: "image/png" };
}

server.tool(
  "get-frames",
  "Render frames from a composition and return them as images so you can see the edit. " +
  "Pass times (seconds) for specific frames, or count (with optional startTime/endTime) for evenly spaced frames; with neither, returns the frame at the current time indicator. " +
  "Each frame comes with its timecode and the visible layers at that time. Use getLayerInfo in/out points to find cut points worth checking.",
  {
    compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Defaults to the active comp."),
    compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
    times: z.array(z.number().min(0)).max(24).optional().describe("Comp times in seconds to render, e.g. [4.2, 4.25] to compare either side of a cut."),
    count: z.number().int().min(1).max(24).optional().describe("Number of evenly spaced frames between startTime and endTime (default: whole comp)."),
    startTime: z.number().min(0).optional().describe("Range start in seconds when using count."),
    endTime: z.number().min(0).optional().describe("Range end in seconds when using count."),
    maxSize: z.number().int().min(128).max(2048).optional().describe("Longest side in pixels of returned images (default 768). Smaller is cheaper; raise it to inspect detail.")
  },
  async (parameters) => {
    const { maxSize = 768, ...frameArgs } = parameters;
    const framesDir = getFramesDir();
    for (const f of fs.readdirSync(framesDir)) {
      if (/\.(png|jpg)$/i.test(f)) {
        fs.rmSync(path.join(framesDir, f), { force: true });
      }
    }

    const frameCount = frameArgs.times?.length ?? frameArgs.count ?? 1;
    const result = await runBridgeCommand("renderFrames", { ...frameArgs, maxSize, outputPrefix: `f${Date.now()}` }, 15000 + frameCount * 5000);
    if (result.isError) {
      return result;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.content[0].text);
    } catch {
      return { content: [{ type: "text" as const, text: `Unexpected renderFrames result: ${result.content[0].text}` }], isError: true };
    }

    const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [{
      type: "text",
      text: JSON.stringify({ composition: parsed.composition, frameCount: parsed.frames.length }, null, 2)
    }];
    for (const frame of parsed.frames) {
      const label = `t=${Number(frame.time).toFixed(3)}s  frame ${frame.frame}${frame.timecode ? `  (${frame.timecode})` : ""}  visible: ${frame.activeLayers.join(", ") || "none"}`;
      if (!(await waitForStableFile(frame.path, 20000))) {
        content.push({ type: "text", text: `${label}\n[frame was not written: ${frame.path}]` });
        continue;
      }
      content.push({ type: "text", text: label });
      content.push({ type: "image", ...loadFrameImage(frame.path, maxSize) });
      removeFrameFiles(frame.path);
    }
    return { content };
  }
);

// ---------- Scene cut detection and shot editing ----------

const CompTargetSchema = {
  compIndex: z.number().int().positive().optional().describe("Project panel item index of the composition (from listCompositions compIndex). Defaults to the active comp."),
  compName: z.string().optional().describe("Composition name. Takes precedence over compIndex."),
};

const LayerTargetSchema = {
  ...CompTargetSchema,
  layerIndex: z.number().int().positive().optional().describe("1-based layer index."),
  layerName: z.string().optional().describe("Exact layer name (alternative to layerIndex)."),
};

function parseBridgeJson(result: ToolResult): any {
  return JSON.parse(result.content[0].text);
}

function jsonResult(value: unknown, isError = false): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError };
}

function getCacheDir(...sub: string[]): string {
  const dir = path.join(os.homedir(), "Library", "Caches", "after-effects-mcp", ...sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Compiles a bundled Swift helper on first use (or when its source changes)
async function ensureNativeBinary(source: string, name: string): Promise<string> {
  const binary = path.join(getCacheDir(), name);
  const stale = !fs.existsSync(binary) || fs.statSync(binary).mtimeMs < fs.statSync(source).mtimeMs;
  if (stale) {
    await execFileAsync("swiftc", ["-O", "-o", binary, source], { timeout: 180000 });
  }
  return binary;
}

function ensureSceneDiffBinary(): Promise<string> {
  return ensureNativeBinary(SCENEDIFF_SOURCE, "scenediff");
}

// Reads a rendered frame as a tiny RGB thumbnail via sips -> BMP
function loadThumbnail(pngPath: string, width = 64, height = 36): Uint8Array {
  const bmpPath = pngPath.replace(/\.png$/i, ".bmp");
  execFileSync("sips", ["-s", "format", "bmp", "-z", String(height), String(width), pngPath, "--out", bmpPath], { stdio: "ignore" });
  const buf = fs.readFileSync(bmpPath);
  const dataOffset = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const h = Math.abs(rawHeight);
  const bytesPerPixel = buf.readUInt16LE(28) / 8;
  const rowSize = Math.ceil((w * bytesPerPixel) / 4) * 4;
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const row = rawHeight > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const p = dataOffset + row * rowSize + x * bytesPerPixel;
      const o = (y * w + x) * 3;
      rgb[o] = buf[p + 2];
      rgb[o + 1] = buf[p + 1];
      rgb[o + 2] = buf[p];
    }
  }
  return rgb;
}

function thumbnailDiff(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / a.length;
}

// Renders comp frames at low resolution and returns a thumbnail per frame number
async function renderThumbnails(target: Record<string, any>, frames: number[], isolateLayerIndex: number): Promise<Map<number, Uint8Array>> {
  const unique = [...new Set(frames)].sort((a, b) => a - b);
  const result = await runBridgeCommand("renderFrames", { ...target, frames: unique, maxSize: 256, isolateLayerIndex, outputPrefix: `cut${Date.now()}` }, 20000 + unique.length * 1500);
  if (result.isError) {
    throw new Error(result.content[0].text);
  }
  const thumbs = new Map<number, Uint8Array>();
  for (const frame of parseBridgeJson(result).frames) {
    if (await waitForStableFile(frame.path, 20000)) {
      thumbs.set(frame.frame, loadThumbnail(frame.path));
    }
    removeFrameFiles(frame.path);
  }
  return thumbs;
}

// Finds which transition inside [from, to] is the hard cut, as rendered by AE
function strongestTransition(thumbs: Map<number, Uint8Array>, from: number, to: number): { frame: number; score: number; ratio: number } | null {
  const scores: Array<{ frame: number; score: number }> = [];
  for (let f = from + 1; f <= to; f++) {
    const a = thumbs.get(f - 1);
    const b = thumbs.get(f);
    if (a && b) {
      scores.push({ frame: f, score: thumbnailDiff(a, b) });
    }
  }
  if (scores.length === 0) {
    return null;
  }
  scores.sort((x, y) => y.score - x.score);
  const runnerUp = scores.length > 1 ? scores[1].score : 0;
  return { frame: scores[0].frame, score: scores[0].score, ratio: scores[0].score / Math.max(runnerUp, 0.5) };
}

// Picks likely hard cuts (source seconds) out of scenediff output
function cutCandidates(stdout: string, sensitivity: number): Array<{ pts: number; score: number }> {
  // First rows are the range's first frame and the reader's priming frame
  const rows = stdout.trim().split("\n").map(line => line.split(" ").map(Number)).slice(2);
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const candidates: Array<{ pts: number; score: number }> = [];
  for (let i = 0; i < rows.length; i++) {
    const [pts, gridDiff, histDiff] = rows[i];
    const neighbours = rows.slice(Math.max(0, i - 6), i + 7).filter(r => r !== rows[i]);
    const gridHit = gridDiff > sensitivity && gridDiff > 4 * median(neighbours.map(r => r[1])) + 3;
    // Dark, low-contrast cuts barely move the colour grid but do shift the histogram
    const histHit = histDiff > 0.06 && histDiff > 3 * median(neighbours.map(r => r[2])) + 0.02;
    if (gridHit || histHit) {
      candidates.push({ pts, score: gridDiff });
    }
  }
  return candidates;
}

// Finds the hard cuts inside one layer's visible range, as comp frames.
// Looks right up to the layer's last frame, so even a frame or two of the next shot is caught.
async function findSceneCuts(target: Record<string, any>, sensitivity = 12, refine = true): Promise<any> {
  if (process.platform !== "darwin") {
    throw new Error("Scene detection needs macOS (AVFoundation and swiftc).");
  }
  const infoResult = await runBridgeCommand("getLayerSourceInfo", target);
  if (infoResult.isError) {
    throw new Error(infoResult.content[0].text);
  }
  const info = parseBridgeJson(infoResult);
  const layer = info.layer;
  if (!info.sourceFilePath) {
    throw new Error(`Layer '${layer.name}' is not file footage.`);
  }
  if (layer.timeRemapEnabled || Math.abs(layer.stretch - 100) > 0.001) {
    throw new Error(`Layer '${layer.name}' is time-remapped or stretched (${layer.stretch}%); detection only supports normal-speed footage.`);
  }

  const fd: number = info.composition.frameDuration;
  const firstFrame = Math.round(layer.inPoint / fd);
  const lastFrame = Math.round(layer.outPoint / fd);
  // Decode a few frames either side so the neighbour statistics hold at the edges too
  const pad = 8 * fd;
  const sourceStart = Math.max(0, layer.inPoint - layer.startTime - pad);
  const sourceEnd = layer.outPoint - layer.startTime + pad;
  const binary = await ensureSceneDiffBinary();
  const { stdout } = await execFileAsync(binary, [info.sourceFilePath, String(sourceStart), String(sourceEnd)], { maxBuffer: 256 * 1024 * 1024, timeout: 30 * 60 * 1000 });

  const candidates: Array<{ approxFrame: number; score: number }> = [];
  for (const c of cutCandidates(stdout, sensitivity)) {
    const approxFrame = Math.round((c.pts + layer.startTime) / fd);
    // A cut on the first frame is the layer's own in-point; anything up to the last frame counts
    if (approxFrame > firstFrame - 2 && approxFrame < lastFrame + 2) {
      candidates.push({ approxFrame, score: c.score });
    }
  }

  const cuts: Array<{ frame: number; time: number; confidence: "high" | "low"; decoderFrame: number; shift: number }> = [];
  // Rendering past the layer's in/out gives blank frames, which would look like a cut
  const clamp = (f: number) => Math.min(Math.max(f, firstFrame), lastFrame - 1);
  if (refine && candidates.length > 0) {
    const near = await renderThumbnails(target, candidates.flatMap(c => [-1, 0, 1, 2, 3].map(d => clamp(c.approxFrame + d))), layer.index);
    const unsure: typeof candidates = [];
    const picked = new Map<number, { frame: number; score: number; ratio: number }>();
    for (const c of candidates) {
      const best = strongestTransition(near, clamp(c.approxFrame - 1), clamp(c.approxFrame + 3));
      if (best && best.score >= 6 && best.ratio >= 2) {
        picked.set(c.approxFrame, best);
      } else {
        unsure.push(c);
      }
    }
    const wide = unsure.length ? await renderThumbnails(target, unsure.flatMap(c => Array.from({ length: 11 }, (_, k) => clamp(c.approxFrame - 4 + k))), layer.index) : new Map<number, Uint8Array>();
    for (const c of candidates) {
      const best = picked.get(c.approxFrame) ?? strongestTransition(wide, clamp(c.approxFrame - 4), clamp(c.approxFrame + 6));
      const confident = !!best && best.score >= 6 && best.ratio >= 2;
      const frame = confident ? best!.frame : c.approxFrame;
      // A decoder cut that AE shows outside the layer isn't inside it; an unsure one near the edge is kept as low confidence
      if (confident && (frame <= firstFrame || frame >= lastFrame)) {
        continue;
      }
      if (!confident && (frame < firstFrame - 1 || frame > lastFrame)) {
        continue;
      }
      cuts.push({ frame, time: frame * fd, confidence: confident ? "high" : "low", decoderFrame: c.approxFrame, shift: frame - c.approxFrame });
    }
  } else {
    for (const c of candidates) {
      if (c.approxFrame > firstFrame && c.approxFrame < lastFrame) {
        cuts.push({ frame: c.approxFrame, time: c.approxFrame * fd, confidence: "low", decoderFrame: c.approxFrame, shift: 0 });
      }
    }
  }

  const cutFrames = [...new Set(cuts.map(c => c.frame).filter(f => f > firstFrame && f < lastFrame))].sort((a, b) => a - b);
  const bounds = [firstFrame, ...cutFrames, lastFrame];
  const shots = bounds.slice(0, -1).map((start, i) => ({
    shot: i + 1,
    inFrame: start,
    outFrame: bounds[i + 1],
    inTime: Number((start * fd).toFixed(4)),
    outTime: Number((bounds[i + 1] * fd).toFixed(4)),
    durationSeconds: Number(((bounds[i + 1] - start) * fd).toFixed(3)),
    midTime: Number((((start + bounds[i + 1]) / 2) * fd).toFixed(4)),
  }));

  return {
    status: "success",
    composition: info.composition,
    layer: { index: layer.index, name: layer.name, inFrame: firstFrame, outFrame: lastFrame },
    refined: refine,
    cutCount: cutFrames.length,
    cutFrames,
    cuts,
    shots,
  };
}

// After moving or retiming clips, scan each placed layer so a scene change inside a clip can't slip through
async function checkClipsForCuts(target: Record<string, any>, layerIndices: number[]): Promise<{ clean: boolean; hiddenCuts: any[]; uncertain: any[]; errors: any[] }> {
  const hiddenCuts: any[] = [];
  const uncertain: any[] = [];
  const errors: any[] = [];
  const compTarget: Record<string, any> = {};
  if (target.compName !== undefined) compTarget.compName = target.compName;
  if (target.compIndex !== undefined) compTarget.compIndex = target.compIndex;
  for (const layerIndex of layerIndices) {
    try {
      const r = await findSceneCuts({ ...compTarget, layerIndex }, 8, true);
      for (const c of r.cuts) {
        const entry = { layerIndex, name: r.layer.name, frame: c.frame, time: Number(c.time.toFixed(4)), clipInFrame: r.layer.inFrame, clipOutFrame: r.layer.outFrame };
        if (c.confidence === "high") hiddenCuts.push(entry);
        else uncertain.push(entry);
      }
    } catch (error) {
      errors.push({ layerIndex, message: String(error) });
    }
  }
  return { clean: hiddenCuts.length === 0 && uncertain.length === 0 && errors.length === 0, hiddenCuts, uncertain, errors };
}

// Runs a placement command, then checks every clip it placed for scene changes inside it
async function runPlacementWithCutCheck(command: string, parameters: Record<string, any>, listKey: string): Promise<ToolResult> {
  const result = await runBridgeCommand(command, parameters, 30000);
  if (result.isError) {
    return result;
  }
  try {
    const body = parseBridgeJson(result);
    if (body.status !== "success") {
      return result;
    }
    const indices: number[] = (body[listKey] || []).map((c: any) => c.layerIndex).filter((i: any) => typeof i === "number");
    // Use the comp the bridge actually changed, in case the active comp moved meanwhile
    const target = body.composition?.compIndex ? { compIndex: body.composition.compIndex } : parameters;
    const cutCheck = await checkClipsForCuts(target, indices);
    body.cutCheck = cutCheck;
    if (!cutCheck.clean) {
      body.status = "needs-attention";
      body.message = "Some placed clips contain a scene change (or one that could not be ruled out). Fix these before calling the edit done.";
    }
    return jsonResult(body, !cutCheck.clean);
  } catch (error) {
    return jsonResult({ status: "needs-attention", message: `Clips were placed but the scene-change check failed: ${String(error)}`, placement: result.content[0].text }, true);
  }
}

server.tool(
  "detect-scene-cuts",
  "Find every hard cut (scene change) in a footage layer, frame-accurate to how After Effects shows it. " +
  "Decodes the layer's source file with macOS AVFoundation to find candidate cuts, then renders a few low-res frames around each in AE to snap it to the exact frame AE changes picture " +
  "(AE and other decoders can disagree by 1-2 frames). Refinement renders the layer on its own, so effects like Posterize Time on layers above don't shift the result. " +
  "Checks right up to the layer's last frame, and uses a histogram test for dark, low-contrast cuts. Hard cuts only; dissolves and fast whip-pans may be missed or flagged low confidence. " +
  "Returns cut frames ready for split-layer, plus the resulting shot list. Use get-frames on each shot to judge content. macOS only.",
  {
    ...LayerTargetSchema,
    sensitivity: z.number().min(1).max(100).optional().describe("Minimum colour-grid change for a candidate cut, 0-255 scale (default 12). Lower finds subtler cuts but more false positives."),
    refine: z.boolean().optional().describe("Snap each cut to AE's rendered frames (default true). Without it, cuts can be 1-2 frames off."),
  },
  async (parameters) => {
    const { sensitivity = 12, refine = true, ...target } = parameters;
    try {
      const r = await findSceneCuts(target, sensitivity, refine);
      return jsonResult({ ...r, next: "Check shots with get-frames (times = midTime of each shot), then split-layer with these cutFrames." });
    } catch (error) {
      return jsonResult({ status: "error", message: `Scene detection failed: ${String(error)}` }, true);
    }
  }
);

server.tool(
  "split-layer",
  "Split one layer into consecutive shot layers at the given cut points (like Edit > Split Layer, repeated). " +
  "Shots are renamed '<namePrefix> 01', '<namePrefix> 02'... and stacked in order where the original layer was. One undo step.",
  {
    ...LayerTargetSchema,
    cutFrames: z.array(z.number().int()).optional().describe("Comp frame numbers where each new shot starts (e.g. cutFrames from detect-scene-cuts)."),
    cutTimes: z.array(z.number()).optional().describe("Comp times in seconds where each new shot starts (rounded to the nearest frame)."),
    namePrefix: z.string().optional().describe("Name prefix for the shot layers (default 'Shot')."),
  },
  async (parameters) => runBridgeCommand("splitLayer", parameters, 60000)
);

server.tool(
  "update-layers",
  "Change simple state on several layers at once: enabled (video on/off), audioEnabled, solo, locked, label colour, name. " +
  "Use enabled:false + audioEnabled:false to drop a shot without deleting it. One undo step.",
  {
    ...CompTargetSchema,
    layers: z.array(z.object({
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      enabled: z.boolean().optional(),
      audioEnabled: z.boolean().optional(),
      solo: z.boolean().optional(),
      locked: z.boolean().optional(),
      label: z.number().int().min(0).max(16).optional().describe("Label colour index (0 none, 1 red, 2 yellow, ...)."),
      name: z.string().optional(),
    })).min(1).describe("Layers to change, each identified by layerIndex or layerName."),
  },
  async (parameters) => runBridgeCommand("updateLayers", parameters, 30000)
);

server.tool(
  "close-gaps",
  "Slide enabled layers back to back in time order, closing gaps left by disabled shots (ripple delete without deleting). " +
  "Disabled layers are left where they are. Later shots move relative to any music, so confirm with the user first. One undo step.",
  {
    ...CompTargetSchema,
    layerIndices: z.array(z.number().int().positive()).optional().describe("Layers to pack. Alternatively use namePrefix."),
    namePrefix: z.string().optional().describe("Pack every layer whose name starts with this, e.g. 'Shot'."),
    startTime: z.number().optional().describe("Where the first shot should start, in seconds (default: where it starts now)."),
  },
  async (parameters) => runBridgeCommand("closeGaps", parameters, 30000)
);

server.tool(
  "get-markers",
  "List the composition markers and every layer's markers (e.g. beat markers on a music layer).",
  {
    ...CompTargetSchema,
  },
  async (parameters) => runBridgeCommand("getMarkers", parameters, 10000)
);

server.tool(
  "cut-to-markers",
  "Lay shots back to back so every cut lands on a marker, optionally shuffling their order first. " +
  "Each shot keeps its source in-point and runs on in the source until the next marker. " +
  "Uses composition markers unless a marker layer is given. Shots beyond the last marker follow at their own length. " +
  "Restacks the shots in play order, then scans every placed shot for scene changes and reports any as needs-attention. Confirm with the user first. One undo step.",
  {
    ...CompTargetSchema,
    layerIndices: z.array(z.number().int().positive()).optional().describe("Shots to cut. Alternatively use namePrefix."),
    namePrefix: z.string().optional().describe("Cut every layer whose name starts with this, e.g. 'Shot'."),
    markerLayerIndex: z.number().int().positive().optional().describe("Take markers from this layer instead of the composition."),
    markerLayerName: z.string().optional().describe("Take markers from the layer with this name instead of the composition."),
    shuffle: z.boolean().optional().describe("Shuffle the shot order first (default true)."),
    seed: z.number().int().optional().describe("Seed for a reproducible shuffle. The seed used is returned."),
    extendIntoSource: z.boolean().optional().describe("Let a shot run on in its source to reach the next marker (default false: a shot never plays past its own out-point)."),
    startTime: z.number().optional().describe("Where the first shot starts, in seconds (default: where the earliest shot starts now)."),
  },
  async (parameters) => runPlacementWithCutCheck("cutToMarkers", parameters, "order")
);

server.tool(
  "arrange-clips",
  "Place clips exactly: for each, the layer, the source frame it starts on, and the comp frames it spans. " +
  "duplicate:true copies the layer first so one shot layer can feed several clips. Restacks clips in the order given, then scans every placed clip for scene changes and reports any as needs-attention. One undo step.",
  {
    ...CompTargetSchema,
    clips: z.array(z.object({
      layerIndex: z.number().int().positive().optional(),
      layerName: z.string().optional(),
      sourceInFrame: z.number().int().optional().describe("Source frame the clip starts on (default: keep the current one)."),
      compInFrame: z.number().int().describe("Comp frame the clip starts on."),
      compOutFrame: z.number().int().describe("Comp frame the clip ends on (exclusive)."),
      name: z.string().optional(),
      enabled: z.boolean().optional(),
      duplicate: z.boolean().optional().describe("Copy the layer and place the copy instead."),
    })).min(1),
  },
  async (parameters) => runPlacementWithCutCheck("arrangeClips", parameters, "clips")
);

// ---------- Media on disk (scenepacks) and project items ----------

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mxf", ".mts", ".m2ts", ".mpg", ".mpeg", ".wmv", ".flv"]);
const SKIP_DIRS = new Set(["node_modules", "Library", "Applications", ".git", ".Trash"]);

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}

function defaultMediaRoots(): string[] {
  const fromEnv = process.env.AE_MCP_MEDIA_ROOTS;
  const roots = fromEnv ? fromEnv.split(":").map(expandHome) : ["Downloads", "Desktop", "Movies", "Documents"].map(d => path.join(os.homedir(), d));
  return roots.filter(r => fs.existsSync(r));
}

function findVideoFiles(root: string, maxDepth: number, limit: number): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of entries) {
      if (found.length >= limit) return;
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name) && !/\.(app|photoslibrary|aep Logs)$/i.test(e.name)) walk(full, depth + 1);
      } else if (VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase())) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}

const probeCache = new Map<string, any>();

// Reads duration, size, fps and codec with AVFoundation, cached per file version
async function probeMedia(files: string[]): Promise<any[]> {
  const keyOf = (f: string) => {
    const st = fs.statSync(f);
    return `${f}|${st.size}|${st.mtimeMs}`;
  };
  const missing = files.filter(f => !probeCache.has(keyOf(f)));
  if (missing.length) {
    const binary = await ensureNativeBinary(MEDIATOOL_SOURCE, "mediatool");
    for (let i = 0; i < missing.length; i += 40) {
      const batch = missing.slice(i, i + 40);
      const { stdout } = await execFileAsync(binary, ["probe", ...batch], { maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        const info = JSON.parse(line);
        probeCache.set(keyOf(info.path), info);
      }
    }
  }
  return files.map(f => probeCache.get(keyOf(f)) ?? { path: f, error: "not probed" });
}

async function renderContactSheet(filePath: string, cells: Array<{ time: number; label?: string }>, columns: number, thumbWidth: number): Promise<{ data: string; mimeType: string; frames: any[] }> {
  const binary = await ensureNativeBinary(MEDIATOOL_SOURCE, "mediatool");
  const out = path.join(getFramesDir(), `sheet${Date.now()}.jpg`);
  const specs = cells.map(c => `${c.time.toFixed(4)}${c.label ? `:${c.label}` : ""}`);
  const { stdout } = await execFileAsync(binary, ["sheet", filePath, out, String(columns), String(thumbWidth), ...specs], { maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  const info = JSON.parse(stdout.trim().split("\n").pop()!);
  const data = fs.readFileSync(out).toString("base64");
  fs.rmSync(out, { force: true });
  return { data, mimeType: "image/jpeg", frames: info.frames };
}

function formatTimecode(t: number): string {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t - h * 3600 - m * 60;
  const ss = s.toFixed(2).padStart(5, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function requireMacOS(): void {
  if (process.platform !== "darwin") {
    throw new Error("Reading media files directly needs macOS (AVFoundation and swiftc).");
  }
}

function resolveMediaFile(filePath: string): string {
  const full = path.resolve(expandHome(filePath));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error(`No file at ${full}`);
  }
  return full;
}

server.tool(
  "browse-media",
  "List the video files in a folder on disk (e.g. a downloaded scenepack) with duration, resolution, frame rate and codec, without importing anything into After Effects. " +
  "With no folder, searches Downloads, Desktop, Movies and Documents (or AE_MCP_MEDIA_ROOTS) and summarises which folders hold videos, to help find the pack. " +
  "Follow up with preview-media to see a clip, detect-media-shots to split a long file into shots, and import-clips to bring clips into the project. macOS only.",
  {
    folder: z.string().optional().describe("Folder to list (absolute, or starting with ~). Omit to search the usual places."),
    recursive: z.boolean().optional().describe("Include subfolders (default true)."),
    nameContains: z.string().optional().describe("Only files whose name or subfolder contains this (case-insensitive)."),
    maxFiles: z.number().int().min(1).max(2000).optional().describe("Stop after this many files (default 400)."),
  },
  async ({ folder, recursive = true, nameContains, maxFiles = 400 }) => {
    try {
      requireMacOS();
      const roots = folder ? [path.resolve(expandHome(folder))] : defaultMediaRoots();
      for (const r of roots) {
        if (!fs.existsSync(r)) return jsonResult({ status: "error", message: `No folder at ${r}` }, true);
      }
      const depth = recursive ? (folder ? 8 : 4) : 0;
      let files = roots.flatMap(r => findVideoFiles(r, depth, maxFiles * 4));
      if (nameContains) {
        const needle = nameContains.toLowerCase();
        files = files.filter(f => f.toLowerCase().includes(needle));
      }
      const truncated = files.length > maxFiles;
      files = files.slice(0, maxFiles);
      const infos = await probeMedia(files);
      const rootOf = (f: string) => roots.find(r => f.startsWith(r + path.sep)) ?? path.dirname(f);
      const list = infos.map(info => {
        const st = fs.statSync(info.path);
        const entry: any = {
          path: info.path,
          name: path.basename(info.path),
          subfolder: path.relative(rootOf(info.path), path.dirname(info.path)) || ".",
          sizeMB: Math.round(st.size / 1048576),
        };
        if (info.error) {
          entry.readable = false;
          entry.note = path.extname(info.path).toLowerCase() === ".mkv" || path.extname(info.path).toLowerCase() === ".webm"
            ? "AVFoundation (and After Effects) can't read this container; convert to .mp4/.mov first."
            : `Could not read: ${info.error}`;
        } else {
          Object.assign(entry, {
            duration: Number(info.duration.toFixed(3)),
            durationText: formatTimecode(info.duration),
            width: info.width,
            height: info.height,
            frameRate: info.frameRate ? Number(info.frameRate.toFixed(3)) : undefined,
            codec: info.codec,
            hasAudio: info.hasAudio,
          });
        }
        return entry;
      });
      const folders = new Map<string, { folder: string; videos: number; totalSeconds: number }>();
      for (const e of list) {
        const dir = path.dirname(e.path);
        const f = folders.get(dir) ?? { folder: dir, videos: 0, totalSeconds: 0 };
        f.videos++;
        f.totalSeconds += e.duration ?? 0;
        folders.set(dir, f);
      }
      return jsonResult({
        status: "success",
        roots,
        fileCount: list.length,
        truncated,
        folders: [...folders.values()].map(f => ({ ...f, totalSeconds: Math.round(f.totalSeconds) })),
        files: list,
        next: "preview-media to look at a file; detect-media-shots for a long file with many shots; import-clips to bring clips in.",
      });
    } catch (error) {
      return jsonResult({ status: "error", message: `browse-media failed: ${String(error)}` }, true);
    }
  }
);

server.tool(
  "preview-media",
  "Look at a video file on disk without importing it: returns one contact-sheet image of frames, each labelled with its source time. " +
  "Pass times (seconds) for exact frames, or count with optional startTime/endTime for evenly spaced frames (default 12 over the whole file). " +
  "Frames are exact (no keyframe snapping). Use it to judge scenepack clips before import-clips. macOS only.",
  {
    filePath: z.string().describe("Video file path (absolute, or starting with ~)."),
    times: z.array(z.number().min(0)).max(48).optional().describe("Source times in seconds to show."),
    count: z.number().int().min(1).max(48).optional().describe("Number of evenly spaced frames between startTime and endTime (default 12)."),
    startTime: z.number().min(0).optional().describe("Range start in seconds when using count (default 0)."),
    endTime: z.number().min(0).optional().describe("Range end in seconds when using count (default: end of file)."),
    columns: z.number().int().min(1).max(8).optional().describe("Frames per row (default 4)."),
    thumbWidth: z.number().int().min(120).max(1600).optional().describe("Width of each frame in pixels (default 320; raise it to inspect detail)."),
  },
  async ({ filePath, times, count = 12, startTime = 0, endTime, columns = 4, thumbWidth = 320 }) => {
    try {
      requireMacOS();
      const file = resolveMediaFile(filePath);
      const [info] = await probeMedia([file]);
      if (info.error) return jsonResult({ status: "error", message: `Can't read ${file}: ${info.error}` }, true);
      const end = Math.min(endTime ?? info.duration, info.duration);
      // Sample the middle of each slice so the first and last frames (often black) are skipped
      const picked = times?.length ? times : Array.from({ length: count }, (_, i) => startTime + (end - startTime) * (i + 0.5) / count);
      const sheet = await renderContactSheet(file, picked.map(t => ({ time: t })), columns, thumbWidth);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ file, duration: Number(info.duration.toFixed(3)), width: info.width, height: info.height, frameRate: info.frameRate, times: picked.map(t => Number(t.toFixed(3))), missingFrames: sheet.frames.filter((f: any) => !f.ok).map((f: any) => f.time) }, null, 2) },
          { type: "image" as const, data: sheet.data, mimeType: sheet.mimeType },
        ],
      };
    } catch (error) {
      return jsonResult({ status: "error", message: `preview-media failed: ${String(error)}` }, true);
    }
  }
);

// Decodes are slow on long files, so the raw per-frame differences are cached per file version and range
async function sceneDiffForFile(file: string, start: number, end: number): Promise<string> {
  const st = fs.statSync(file);
  const key = Buffer.from(`${file}|${st.size}|${st.mtimeMs}|${start.toFixed(3)}|${end.toFixed(3)}`).toString("base64url").slice(-120);
  const cacheFile = path.join(getCacheDir("shots"), `${key}.txt`);
  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, "utf8");
  }
  const binary = await ensureSceneDiffBinary();
  const { stdout } = await execFileAsync(binary, [file, String(start), String(end)], { maxBuffer: 512 * 1024 * 1024, timeout: 60 * 60 * 1000 });
  fs.writeFileSync(cacheFile, stdout);
  return stdout;
}

server.tool(
  "detect-media-shots",
  "Split a video file on disk into shots (hard cuts) without importing it, e.g. to find usable clips in a scenepack or film. " +
  "Decodes at roughly 15x realtime for 4K (a 2-hour film takes ~5 minutes); results are cached, so re-running with another sensitivity or minShotSeconds is instant. " +
  "Returns source in/out times per shot and, by default, a contact sheet of shot midpoints labelled with shot numbers. " +
  "Times can be 1-2 frames off what AE shows; import-clips re-checks placed clips frame-accurately in AE. macOS only.",
  {
    filePath: z.string().describe("Video file path (absolute, or starting with ~)."),
    startTime: z.number().min(0).optional().describe("Only scan from here, in seconds (default 0)."),
    endTime: z.number().min(0).optional().describe("Only scan up to here, in seconds (default: end of file)."),
    sensitivity: z.number().min(1).max(100).optional().describe("Minimum colour-grid change for a cut, 0-255 scale (default 12). Lower finds subtler cuts but more false positives."),
    minShotSeconds: z.number().min(0).optional().describe("Only list shots at least this long (default 0). Cuts are still detected; short shots are just left out of the list."),
    preview: z.boolean().optional().describe("Return a contact sheet of the listed shots' midpoints (default true, up to previewLimit shots)."),
    previewOffset: z.number().int().min(0).optional().describe("Skip this many listed shots before the contact sheet starts (to page through long lists)."),
    previewLimit: z.number().int().min(1).max(48).optional().describe("Shots on the contact sheet (default 32)."),
  },
  async ({ filePath, startTime = 0, endTime, sensitivity = 12, minShotSeconds = 0, preview = true, previewOffset = 0, previewLimit = 32 }) => {
    try {
      requireMacOS();
      const file = resolveMediaFile(filePath);
      const [info] = await probeMedia([file]);
      if (info.error) return jsonResult({ status: "error", message: `Can't read ${file}: ${info.error}` }, true);
      const end = Math.min(endTime ?? info.duration, info.duration);
      if (end <= startTime) return jsonResult({ status: "error", message: "endTime must be after startTime." }, true);
      const fps = info.frameRate || 24;
      const snap = (t: number) => Math.round(t * fps) / fps;

      const stdout = await sceneDiffForFile(file, startTime, end);
      const cutTimes = [...new Set(cutCandidates(stdout, sensitivity).map(c => snap(c.pts)))]
        .filter(t => t > startTime + 0.5 / fps && t < end - 0.5 / fps)
        .sort((a, b) => a - b);
      const bounds = [snap(startTime), ...cutTimes, end];
      const allShots = bounds.slice(0, -1).map((inTime, i) => ({
        shot: i + 1,
        inTime: Number(inTime.toFixed(4)),
        outTime: Number(bounds[i + 1].toFixed(4)),
        duration: Number((bounds[i + 1] - inTime).toFixed(3)),
        midTime: Number(((inTime + bounds[i + 1]) / 2).toFixed(4)),
        inText: formatTimecode(inTime),
      }));
      const shots = allShots.filter(s => s.duration >= minShotSeconds);

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      const page = shots.slice(previewOffset, previewOffset + previewLimit);
      content.push({
        type: "text",
        text: JSON.stringify({
          status: "success",
          file,
          frameRate: fps,
          scanned: { startTime, endTime: Number(end.toFixed(3)) },
          cutCount: cutTimes.length,
          shotCount: allShots.length,
          listedShots: shots.length,
          preview: preview && page.length ? { fromShot: page[0].shot, toShot: page[page.length - 1].shot, remaining: Math.max(0, shots.length - previewOffset - page.length) } : null,
          shots,
          next: "import-clips with sourceIn = inTime and sourceOut = outTime of the shots you want (trim a frame or two inside to be safe).",
        }, null, 2),
      });
      if (preview && page.length) {
        const sheet = await renderContactSheet(file, page.map(s => ({ time: s.midTime, label: `#${s.shot} ${s.inText} (${s.duration.toFixed(1)}s)` })), page.length > 16 ? 6 : 4, page.length > 16 ? 240 : 300);
        content.push({ type: "image", data: sheet.data, mimeType: sheet.mimeType });
      }
      return { content };
    } catch (error) {
      return jsonResult({ status: "error", message: `detect-media-shots failed: ${String(error)}` }, true);
    }
  }
);

server.tool(
  "list-project-items",
  "List everything in the open After Effects project: footage (with file path, duration, size, fps, missing flag, which comps use it), compositions, folders and solids, with their project folder. " +
  "index is the project item index used by compIndex in other tools.",
  {
    type: z.enum(["all", "footage", "comp", "folder", "solid"]).optional().describe("Only items of this type (default all)."),
    nameContains: z.string().optional().describe("Only items whose name or file path contains this (case-insensitive)."),
  },
  async (parameters) => runBridgeCommand("listProjectItems", parameters, 15000)
);

server.tool(
  "import-clips",
  "Import video files from disk (e.g. scenepack clips) into the project and optionally place trimmed clips in a composition. " +
  "Files already in the project are reused, not imported twice; new footage goes in a project folder (default 'Scenepack'). " +
  "Each clip takes a source in/out (seconds) and a comp start time; without compTime, clips go back to back from the current time indicator. " +
  "After placing, every new clip is scanned in AE for hidden scene changes and reported as needs-attention. Set place:false to only import. One undo step.",
  {
    ...CompTargetSchema,
    clips: z.array(z.object({
      filePath: z.string().describe("Video file path (absolute, or starting with ~)."),
      sourceIn: z.number().min(0).optional().describe("Source time in seconds the clip starts on (default 0)."),
      sourceOut: z.number().min(0).optional().describe("Source time in seconds the clip ends on, exclusive (default: end of file)."),
      compTime: z.number().optional().describe("Comp time in seconds the clip starts at (default: right after the previous clip, first at the current time indicator)."),
      name: z.string().optional().describe("Layer name."),
    })).min(1).max(200),
    place: z.boolean().optional().describe("Place clips as layers in the comp (default true). false only imports the files."),
    folderName: z.string().optional().describe("Project folder for newly imported footage (default 'Scenepack'; empty string for the project root)."),
    checkCuts: z.boolean().optional().describe("Scan placed clips for scene changes inside them (default true)."),
  },
  async ({ clips, checkCuts = true, ...rest }) => {
    const resolved = clips.map(c => ({ ...c, filePath: path.resolve(expandHome(c.filePath)) }));
    for (const c of resolved) {
      if (!fs.existsSync(c.filePath)) {
        return jsonResult({ status: "error", message: `No file at ${c.filePath}` }, true);
      }
    }
    const parameters = { ...rest, clips: resolved };
    if (rest.place === false || !checkCuts) {
      return runBridgeCommand("importClips", parameters, 60000 + clips.length * 2000);
    }
    return runPlacementWithCutCheck("importClips", parameters, "clips");
  }
);

async function main() {
  console.error("After Effects MCP Server starting...");
  console.error(`Temp directory: ${TEMP_DIR}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("After Effects MCP Server running...");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});

