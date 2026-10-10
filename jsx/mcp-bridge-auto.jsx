








function createComposition(args) {
    try {
        var name = args.name || "New Composition";
        var width = parseInt(args.width) || 1920;
        var height = parseInt(args.height) || 1080;
        var pixelAspect = parseFloat(args.pixelAspect) || 1.0;
        var duration = parseFloat(args.duration) || 10.0;
        var frameRate = parseFloat(args.frameRate) || 30.0;
        var bgColor = args.backgroundColor ? [args.backgroundColor.r/255, args.backgroundColor.g/255, args.backgroundColor.b/255] : [0, 0, 0];
        var newComp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
        if (args.backgroundColor) {
            newComp.bgColor = bgColor;
        }
        return JSON.stringify({
            status: "success", message: "Composition created successfully",
            composition: { name: newComp.name, id: newComp.id, width: newComp.width, height: newComp.height, pixelAspect: newComp.pixelAspect, duration: newComp.duration, frameRate: newComp.frameRate, bgColor: newComp.bgColor }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createTextLayer(args) {
    try {
        var compName = args.compName || "";
        var text = args.text || "Text Layer";
        var position = args.position || [960, 540]; 
        var fontSize = args.fontSize || 72;
        var color = args.color || [1, 1, 1]; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var fontFamily = args.fontFamily || "Arial";
        var alignment = args.alignment || "center"; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var textLayer = comp.layers.addText(text);
        var textProp = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = textProp.value;
        textDocument.fontSize = fontSize;
        textDocument.fillColor = color;
        textDocument.font = fontFamily;
        if (alignment === "left") { textDocument.justification = ParagraphJustification.LEFT_JUSTIFY; } 
        else if (alignment === "center") { textDocument.justification = ParagraphJustification.CENTER_JUSTIFY; } 
        else if (alignment === "right") { textDocument.justification = ParagraphJustification.RIGHT_JUSTIFY; }
        textProp.setValue(textDocument);
        textLayer.property("Position").setValue(position);
        textLayer.startTime = startTime;
        if (duration > 0) { textLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Text layer created successfully",
            layer: { name: textLayer.name, index: textLayer.index, type: "text", inPoint: textLayer.inPoint, outPoint: textLayer.outPoint, position: textLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createShapeLayer(args) {
    try {
        var compName = args.compName || "";
        var shapeType = args.shapeType || "rectangle"; 
        var position = args.position || [960, 540]; 
        var size = args.size || [200, 200]; 
        var fillColor = args.fillColor || [1, 0, 0]; 
        var strokeColor = args.strokeColor || [0, 0, 0]; 
        var strokeWidth = args.strokeWidth || 0; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var name = args.name || "Shape Layer";
        var points = args.points || 5; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = name;
        var contents = shapeLayer.property("Contents"); 
        var shapeGroup = contents.addProperty("ADBE Vector Group");
        var groupContents = shapeGroup.property("Contents"); 
        var shapePathProperty;
        if (shapeType === "rectangle") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Rect");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "ellipse") {
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Ellipse");
            shapePathProperty.property("Size").setValue(size);
        } else if (shapeType === "polygon" || shapeType === "star") { 
            shapePathProperty = groupContents.addProperty("ADBE Vector Shape - Star");
            shapePathProperty.property("Type").setValue(shapeType === "polygon" ? 1 : 2); 
            shapePathProperty.property("Points").setValue(points);
            shapePathProperty.property("Outer Radius").setValue(size[0] / 2);
            if (shapeType === "star") { shapePathProperty.property("Inner Radius").setValue(size[0] / 3); }
        }
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("Color").setValue(fillColor);
        fill.property("Opacity").setValue(100);
        if (strokeWidth > 0) {
            var stroke = groupContents.addProperty("ADBE Vector Graphic - Stroke");
            stroke.property("Color").setValue(strokeColor);
            stroke.property("Stroke Width").setValue(strokeWidth);
            stroke.property("Opacity").setValue(100);
        }
        shapeLayer.property("Position").setValue(position);
        shapeLayer.startTime = startTime;
        if (duration > 0) { shapeLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: "Shape layer created successfully",
            layer: { name: shapeLayer.name, index: shapeLayer.index, type: "shape", shapeType: shapeType, inPoint: shapeLayer.inPoint, outPoint: shapeLayer.outPoint, position: shapeLayer.property("Position").value }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function createSolidLayer(args) {
    try {
        var compName = args.compName || "";
        var color = args.color || [1, 1, 1]; 
        var name = args.name || "Solid Layer";
        var position = args.position || [960, 540]; 
        var size = args.size; 
        var startTime = args.startTime || 0;
        var duration = args.duration || 5; 
        var isAdjustment = args.isAdjustment || false; 
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        if (!size) { size = [comp.width, comp.height]; }
        var solidLayer;
        if (isAdjustment) {
            solidLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
            solidLayer.adjustmentLayer = true;
        } else {
            solidLayer = comp.layers.addSolid(color, name, size[0], size[1], 1);
        }
        solidLayer.property("Position").setValue(position);
        solidLayer.startTime = startTime;
        if (duration > 0) { solidLayer.outPoint = startTime + duration; }
        return JSON.stringify({
            status: "success", message: isAdjustment ? "Adjustment layer created successfully" : "Solid layer created successfully",
            layer: { name: solidLayer.name, index: solidLayer.index, type: isAdjustment ? "adjustment" : "solid", inPoint: solidLayer.inPoint, outPoint: solidLayer.outPoint, position: solidLayer.property("Position").value, isAdjustment: solidLayer.adjustmentLayer }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}


function setLayerProperties(args) {
    try {
        var compName = args.compName || "";
        var layerName = args.layerName || "";
        var layerIndex = args.layerIndex; 
        
        
        var position = args.position; 
        var scale = args.scale; 
        var rotation = args.rotation; 
        var opacity = args.opacity; 
        var startTime = args.startTime; 
        var duration = args.duration; 

        
        var textContent = args.text; 
        var fontFamily = args.fontFamily; 
        var fontSize = args.fontSize; 
        var fillColor = args.fillColor; 
        
        
        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) { comp = item; break; }
        }
        if (!comp) {
            if (app.project.activeItem instanceof CompItem) { comp = app.project.activeItem; } 
            else { throw new Error("No composition found with name '" + compName + "' and no active composition"); }
        }
        
        
        var layer = null;
        if (layerIndex !== undefined && layerIndex !== null) {
            if (layerIndex > 0 && layerIndex <= comp.numLayers) { layer = comp.layer(layerIndex); } 
            else { throw new Error("Layer index out of bounds: " + layerIndex); }
        } else if (layerName) {
            for (var j = 1; j <= comp.numLayers; j++) {
                if (comp.layer(j).name === layerName) { layer = comp.layer(j); break; }
            }
        }
        if (!layer) { throw new Error("Layer not found: " + (layerName || "index " + layerIndex)); }
        
        var changedProperties = [];
        var textDocumentChanged = false;
        var textProp = null;
        var textDocument = null;

        
        if (layer instanceof TextLayer && (textContent !== undefined || fontFamily !== undefined || fontSize !== undefined || fillColor !== undefined)) {
            var sourceTextProp = layer.property("Source Text");
            if (sourceTextProp && sourceTextProp.value) {
                var currentTextDocument = sourceTextProp.value; 
                var updated = false;

                if (textContent !== undefined && textContent !== null && currentTextDocument.text !== textContent) {
                    currentTextDocument.text = textContent;
                    changedProperties.push("text");
                    updated = true;
                }
                if (fontFamily !== undefined && fontFamily !== null && currentTextDocument.font !== fontFamily) {
                    
                    
                    currentTextDocument.font = fontFamily;
                    changedProperties.push("fontFamily");
                    updated = true;
                }
                if (fontSize !== undefined && fontSize !== null && currentTextDocument.fontSize !== fontSize) {
                    currentTextDocument.fontSize = fontSize;
                    changedProperties.push("fontSize");
                    updated = true;
                }
                
                
                if (fillColor !== undefined && fillColor !== null && 
                    (currentTextDocument.fillColor[0] !== fillColor[0] || 
                     currentTextDocument.fillColor[1] !== fillColor[1] || 
                     currentTextDocument.fillColor[2] !== fillColor[2])) {
                    currentTextDocument.fillColor = fillColor;
                    changedProperties.push("fillColor");
                    updated = true;
                }

                
                if (updated) {
                    try {
                        sourceTextProp.setValue(currentTextDocument);
                        logToPanel("Applied changes to Text Document for layer: " + layer.name);
                    } catch (e) {
                        logToPanel("ERROR applying Text Document changes: " + e.toString());
                        
                        
                    }
                }
                 
                 textDocument = currentTextDocument; 

            } else {
                logToPanel("Warning: Could not access Source Text property for layer: " + layer.name);
            }
        }

        
        if (position !== undefined && position !== null) { layer.property("Position").setValue(position); changedProperties.push("position"); }
        if (scale !== undefined && scale !== null) { layer.property("Scale").setValue(scale); changedProperties.push("scale"); }
        if (rotation !== undefined && rotation !== null) {
            if (layer.threeDLayer) { 
                
                layer.property("Z Rotation").setValue(rotation);
            } else { 
                layer.property("Rotation").setValue(rotation); 
            }
            changedProperties.push("rotation");
        }
        if (opacity !== undefined && opacity !== null) { layer.property("Opacity").setValue(opacity); changedProperties.push("opacity"); }
        if (startTime !== undefined && startTime !== null) { layer.startTime = startTime; changedProperties.push("startTime"); }
        if (duration !== undefined && duration !== null && duration > 0) {
            var actualStartTime = (startTime !== undefined && startTime !== null) ? startTime : layer.startTime;
            layer.outPoint = actualStartTime + duration;
            changedProperties.push("duration");
        }

        
        var returnLayerInfo = {
            name: layer.name,
            index: layer.index,
            position: layer.property("Position").value,
            scale: layer.property("Scale").value,
            rotation: layer.threeDLayer ? layer.property("Z Rotation").value : layer.property("Rotation").value, 
            opacity: layer.property("Opacity").value,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            changedProperties: changedProperties
        };
        
        if (layer instanceof TextLayer && textDocument) {
            returnLayerInfo.text = textDocument.text;
            returnLayerInfo.fontFamily = textDocument.font;
            returnLayerInfo.fontSize = textDocument.fontSize;
            returnLayerInfo.fillColor = textDocument.fillColor;
        }

        
        logToPanel("Final check before return:");
        logToPanel("  Changed Properties: " + changedProperties.join(", "));
        logToPanel("  Return Layer Info Font: " + (returnLayerInfo.fontFamily || "N/A")); 
        logToPanel("  TextDocument Font: " + (textDocument ? textDocument.font : "N/A"));

        return JSON.stringify({
            status: "success", message: "Layer properties updated successfully",
            layer: returnLayerInfo
        }, null, 2);
    } catch (error) {
        
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function coerceScriptValue(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return rawValue;
    }

    if (typeof rawValue !== "string") {
        return rawValue;
    }

    var trimmed = rawValue.replace(/^\s+|\s+$/g, "");
    if (trimmed === "") {
        return rawValue;
    }

    
    var firstChar = trimmed.charAt(0);
    if (firstChar === "[" || firstChar === "{" || firstChar === '"' || trimmed === "true" || trimmed === "false" || trimmed === "null") {
        try {
            return JSON.parse(trimmed);
        } catch (e) {
            
        }
    }

    
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    return rawValue;
}


function setLayerKeyframe(compIndex, layerIndex, propertyName, timeInSeconds, value) {
    try {
        
        var comp = app.project.items[compIndex];
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
        if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("Transform");
        if (!transformGroup) {
             return JSON.stringify({ success: false, message: "Transform properties not found for layer '" + layer.name + "' (type: " + layer.matchName + ")." });
        }

        var property = transformGroup.property(propertyName);
        if (!property) {
            
             if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                 property = layer.property("Effects").property(propertyName);
             } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                 property = layer.property("Text").property(propertyName);
            } 

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }


        
        if (!property.canVaryOverTime) {
             return JSON.stringify({ success: false, message: "Property '" + propertyName + "' cannot be keyframed." });
        }

        
        if (property.numKeys === 0 && !property.isTimeVarying) {
             property.setValueAtTime(comp.time, property.value); 
        }


        var normalizedValue = coerceScriptValue(value);
        property.setValueAtTime(timeInSeconds, normalizedValue);

        return JSON.stringify({ success: true, message: "Keyframe set for '" + propertyName + "' on layer '" + layer.name + "' at " + timeInSeconds + "s.", value: normalizedValue });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting keyframe: " + e.toString() + " (Line: " + e.line + ")" });
    }
}



function setLayerExpression(compIndex, layerIndex, propertyName, expressionString) {
    try {
         
        var comp = app.project.items[compIndex];
         if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ success: false, message: "Composition not found at index " + compIndex });
        }
        var layer = comp.layers[layerIndex];
         if (!layer) {
            return JSON.stringify({ success: false, message: "Layer not found at index " + layerIndex + " in composition '" + comp.name + "'"});
        }

        var transformGroup = layer.property("Transform");
         if (!transformGroup) {
             
             
        }

        var property = transformGroup ? transformGroup.property(propertyName) : null;
         if (!property) {
            
             if (layer.property("Effects") && layer.property("Effects").property(propertyName)) {
                 property = layer.property("Effects").property(propertyName);
             } else if (layer.property("Text") && layer.property("Text").property(propertyName)) {
                 property = layer.property("Text").property(propertyName);
             } 

            if (!property) {
                 return JSON.stringify({ success: false, message: "Property '" + propertyName + "' not found on layer '" + layer.name + "'." });
            }
        }

        if (!property.canSetExpression) {
            return JSON.stringify({ success: false, message: "Property '" + propertyName + "' does not support expressions." });
        }

        property.expression = expressionString;

        var action = expressionString === "" ? "removed" : "set";
        return JSON.stringify({ success: true, message: "Expression " + action + " for '" + propertyName + "' on layer '" + layer.name + "'." });
    } catch (e) {
        return JSON.stringify({ success: false, message: "Error setting expression: " + e.toString() + " (Line: " + e.line + ")" });
    }
}

function tryAddEffect(layer, identifier, mode) {
    if (!identifier) {
        return null;
    }

    try {
        if (mode === "matchName") {
            return layer.Effects.addProperty(identifier);
        }
        if (mode === "name") {
            return layer.Effects.addProperty(identifier);
        }
    } catch (e) {
        return null;
    }

    return null;
}

function addEffectByAnyIdentifier(layer, effectIdentifier, effectName, effectMatchName) {
    var attempts = [];
    var effect = null;

    if (effectMatchName) {
        attempts.push({ value: effectMatchName, mode: "matchName" });
    }

    if (effectIdentifier) {
        attempts.push({ value: effectIdentifier, mode: "matchName" });
        attempts.push({ value: effectIdentifier, mode: "name" });
    }

    if (effectName) {
        attempts.push({ value: effectName, mode: "name" });
    }

    for (var i = 0; i < attempts.length; i++) {
        effect = tryAddEffect(layer, attempts[i].value, attempts[i].mode);
        if (effect) {
            return {
                effect: effect,
                resolvedBy: attempts[i]
            };
        }
    }

    return null;
}


function applyEffect(args) {
    try {
        
        var compIndex = resolveCompIndex(args); 
        var layerIndex = args.layerIndex || 1; 
        var effectIdentifier = args.effect || args.effectIdentifier; 
        var effectName = args.effectName; 
        var effectMatchName = args.effectMatchName; 
        var effectCategory = args.effectCategory || ""; 
        var presetPath = args.presetPath; 
        var effectSettings = args.effectSettings || {}; 
        
        if (!effectIdentifier && !effectName && !effectMatchName && !presetPath) {
            throw new Error("You must specify effect, effectIdentifier, effectName, effectMatchName, or presetPath");
        }
        
        
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        var effectResult;
        
        
        if (presetPath) {
            var presetFile = new File(presetPath);
            if (!presetFile.exists) {
                throw new Error("Effect preset file not found: " + presetPath);
            }
            
            
            layer.applyPreset(presetFile);
            effectResult = {
                type: "preset",
                name: presetPath.split('/').pop().split('\\').pop(),
                applied: true
            };
        }
        
        else if (effectMatchName || effectName || effectIdentifier) {
            var added = addEffectByAnyIdentifier(layer, effectIdentifier, effectName, effectMatchName);
            if (!added || !added.effect) {
                throw new Error("Could not add effect. Try a valid effectMatchName (for example: 'ADBE Gaussian Blur 2') or exact effect display name.");
            }

            var effect = added.effect;
            effectResult = {
                type: "effect",
                name: effect.name,
                matchName: effect.matchName,
                index: effect.propertyIndex,
                resolvedBy: added.resolvedBy
            };
            
            
            applyEffectSettings(effect, effectSettings);
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect applied successfully",
            effect: effectResult,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


function applyEffectSettings(effect, settings) {
    
    var hasAnySetting = false;
    if (!settings) {
        return;
    }
    for (var key in settings) {
        if (settings.hasOwnProperty(key)) {
            hasAnySetting = true;
            break;
        }
    }
    if (!hasAnySetting) {
        return;
    }
    
    
    for (var propName in settings) {
        if (settings.hasOwnProperty(propName)) {
            try {
                
                var property = null;
                
                
                try {
                    property = effect.property(propName);
                } catch (e) {
                    
                    for (var i = 1; i <= effect.numProperties; i++) {
                        var prop = effect.property(i);
                        if (prop.name === propName) {
                            property = prop;
                            break;
                        }
                    }
                }
                
                
                if (property && property.setValue) {
                    property.setValue(coerceScriptValue(settings[propName]));
                }
            } catch (e) {
                
                $.writeln("Error setting effect property '" + propName + "': " + e.toString());
            }
        }
    }
}

function findPropertyByNameOrMatchName(container, propertyName) {
    if (!container || !propertyName || !container.numProperties) {
        return null;
    }

    for (var i = 1; i <= container.numProperties; i++) {
        var candidate = container.property(i);
        if (candidate && (candidate.name === propertyName || candidate.matchName === propertyName)) {
            return candidate;
        }
    }

    return null;
}

function resolvePropertyPath(rootProperty, pathTokens) {
    var current = rootProperty;

    for (var i = 0; i < pathTokens.length; i++) {
        if (!current) {
            return null;
        }

        var token = pathTokens[i];
        var nextProperty = null;

        if (typeof token === "number") {
            nextProperty = current.property(token);
        } else {
            nextProperty = current.property(token);
            if (!nextProperty) {
                nextProperty = findPropertyByNameOrMatchName(current, token);
            }
        }

        current = nextProperty;
    }

    return current;
}

function normalizePropertyPath(pathInput) {
    if (pathInput instanceof Array) {
        return pathInput;
    }

    if (typeof pathInput === "string" && pathInput.length > 0) {
        return pathInput.split("/");
    }

    return [];
}

function readPropertyValue(prop) {
    try {
        if (!prop || prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
            return null;
        }
        return prop.value;
    } catch (e) {
        return null;
    }
}

function serializeEffectProperty(prop, includeValues, currentDepth, maxDepth) {
    var propertyInfo = {
        name: prop.name,
        matchName: prop.matchName,
        index: prop.propertyIndex,
        canSetExpression: !!prop.canSetExpression,
        canVaryOverTime: !!prop.canVaryOverTime,
        numKeys: prop.numKeys || 0,
        isGroup: prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP,
        children: []
    };

    if (includeValues) {
        propertyInfo.value = readPropertyValue(prop);
    }

    if (propertyInfo.isGroup && currentDepth < maxDepth && prop.numProperties) {
        for (var i = 1; i <= prop.numProperties; i++) {
            var child = prop.property(i);
            if (child) {
                propertyInfo.children.push(serializeEffectProperty(child, includeValues, currentDepth + 1, maxDepth));
            }
        }
    }

    return propertyInfo;
}

function resolveCompAndLayer(args) {
    var compIndex = resolveCompIndex(args);
    var layerIndex = args.layerIndex || 1;

    var comp = app.project.item(compIndex);
    if (!comp || !(comp instanceof CompItem)) {
        throw new Error("Composition not found at index " + compIndex);
    }

    var layer = comp.layer(layerIndex);
    if (!layer) {
        throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
    }

    return {
        comp: comp,
        layer: layer,
        compIndex: compIndex,
        layerIndex: layerIndex
    };
}

function resolveEffectOnLayer(layer, args) {
    var effectsGroup = layer.property("Effects");
    if (!effectsGroup) {
        throw new Error("Layer has no Effects group");
    }

    var effect = null;

    if (args.effectIndex !== undefined && args.effectIndex !== null) {
        effect = effectsGroup.property(args.effectIndex);
    }

    if (!effect && args.effectName) {
        effect = findPropertyByNameOrMatchName(effectsGroup, args.effectName);
    }

    if (!effect && args.effectMatchName) {
        effect = findPropertyByNameOrMatchName(effectsGroup, args.effectMatchName);
    }

    if (!effect) {
        throw new Error("Effect not found on layer. Provide effectIndex, effectName, or effectMatchName.");
    }

    return effect;
}

function listLayerEffects(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var layer = resolved.layer;
        var effectsGroup = layer.property("Effects");
        var includeProperties = !!args.includeProperties;
        var includeValues = !!args.includeValues;
        var maxDepth = args.maxDepth || 2;

        var effects = [];
        if (effectsGroup && effectsGroup.numProperties) {
            for (var i = 1; i <= effectsGroup.numProperties; i++) {
                var effect = effectsGroup.property(i);
                var effectInfo = {
                    index: effect.propertyIndex,
                    name: effect.name,
                    matchName: effect.matchName,
                    enabled: effect.enabled
                };

                if (includeProperties) {
                    effectInfo.properties = [];
                    for (var j = 1; j <= effect.numProperties; j++) {
                        var child = effect.property(j);
                        effectInfo.properties.push(serializeEffectProperty(child, includeValues, 1, maxDepth));
                    }
                }

                effects.push(effectInfo);
            }
        }

        return JSON.stringify({
            status: "success",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: layer.name,
                index: resolved.layerIndex
            },
            effectCount: effects.length,
            effects: effects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function listAvailableEffects(args) {
    try {
        var params = args || {};
        var query = params.query ? String(params.query).toLowerCase() : "";
        var includeObsolete = !!params.includeObsolete;
        var maxResults = (params.maxResults !== undefined && params.maxResults !== null)
            ? Number(params.maxResults)
            : 5000;

        if (!app.effects) {
            throw new Error("After Effects app.effects API is not available in this version.");
        }

        var effectsCollection = app.effects;
        var collectionCount = 0;
        if (effectsCollection.length !== undefined && effectsCollection.length !== null) {
            collectionCount = Number(effectsCollection.length);
        } else if (effectsCollection.numEffects !== undefined && effectsCollection.numEffects !== null) {
            collectionCount = Number(effectsCollection.numEffects);
        }

        var effects = [];
        for (var i = 0; i < collectionCount; i++) {
            var effectObj = null;
            try {
                effectObj = effectsCollection[i];
            } catch (e1) {
                effectObj = null;
            }
            if (!effectObj && effectsCollection.effect) {
                try {
                    effectObj = effectsCollection.effect(i + 1);
                } catch (e2) {
                    effectObj = null;
                }
            }
            if (!effectObj) {
                continue;
            }

            var name = "";
            var matchName = "";
            var category = "";
            var isObsolete = false;

            try { name = effectObj.displayName || effectObj.name || ""; } catch (e3) {}
            try { matchName = effectObj.matchName || ""; } catch (e4) {}
            try { category = effectObj.category || ""; } catch (e5) {}
            try { isObsolete = !!effectObj.isObsolete; } catch (e6) {}

            if (!includeObsolete && isObsolete) {
                continue;
            }

            if (query) {
                var haystack = (String(name) + " " + String(matchName) + " " + String(category)).toLowerCase();
                if (haystack.indexOf(query) === -1) {
                    continue;
                }
            }

            effects.push({
                index: i,
                name: name,
                matchName: matchName,
                category: category,
                isObsolete: isObsolete
            });

            if (effects.length >= maxResults) {
                break;
            }
        }

        return JSON.stringify({
            status: "success",
            query: query || null,
            includeObsolete: includeObsolete,
            returnedCount: effects.length,
            totalScanned: collectionCount,
            effects: effects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getInterpolationTypeByName(name) {
    if (!name) {
        return null;
    }

    var normalized = String(name).toLowerCase();
    if (normalized === "linear") {
        return KeyframeInterpolationType.LINEAR;
    }
    if (normalized === "bezier") {
        return KeyframeInterpolationType.BEZIER;
    }
    if (normalized === "hold") {
        return KeyframeInterpolationType.HOLD;
    }

    return null;
}

function getPropertyDimensionCount(property) {
    try {
        var value = property.value;
        if (value instanceof Array) {
            return value.length;
        }
    } catch (e) {
        
    }
    return 1;
}

function findKeyIndexAtTime(property, timeInSeconds) {
    var epsilon = 0.0001;
    for (var i = 1; i <= property.numKeys; i++) {
        if (Math.abs(property.keyTime(i) - timeInSeconds) <= epsilon) {
            return i;
        }
    }
    return -1;
}

function buildEaseArray(dimensionCount, speed, influence) {
    var easeArray = [];
    var resolvedSpeed = (speed !== undefined && speed !== null) ? Number(speed) : 0;
    var resolvedInfluence = (influence !== undefined && influence !== null) ? Number(influence) : 33.333;

    for (var i = 0; i < dimensionCount; i++) {
        easeArray.push(new KeyframeEase(resolvedSpeed, resolvedInfluence));
    }

    return easeArray;
}

function buildEaseArrayFromSpec(dimensionCount, spec, fallbackSpeed, fallbackInfluence) {
    if (spec instanceof Array) {
        var result = [];
        for (var i = 0; i < dimensionCount; i++) {
            var item = spec[i] || spec[spec.length - 1] || {};
            var itemSpeed = (item.speed !== undefined && item.speed !== null) ? Number(item.speed) : fallbackSpeed;
            var itemInfluence = (item.influence !== undefined && item.influence !== null) ? Number(item.influence) : fallbackInfluence;
            result.push(new KeyframeEase(itemSpeed, itemInfluence));
        }
        return result;
    }

    var speed = spec && spec.speed;
    var influence = spec && spec.influence;
    return buildEaseArray(
        dimensionCount,
        (speed !== undefined && speed !== null) ? speed : fallbackSpeed,
        (influence !== undefined && influence !== null) ? influence : fallbackInfluence
    );
}

function getKeyframeOptionsFromArgs(args) {
    var options = args.keyframeOptions || {};

    
    if (args.easyEase !== undefined) {
        options.easyEase = args.easyEase;
    }
    if (args.interpolationIn !== undefined) {
        options.interpolationIn = args.interpolationIn;
    }
    if (args.interpolationOut !== undefined) {
        options.interpolationOut = args.interpolationOut;
    }
    if (args.temporalContinuous !== undefined) {
        options.temporalContinuous = args.temporalContinuous;
    }
    if (args.temporalAutoBezier !== undefined) {
        options.temporalAutoBezier = args.temporalAutoBezier;
    }
    if (args.roving !== undefined) {
        options.roving = args.roving;
    }
    if (args.easeIn !== undefined) {
        options.easeIn = args.easeIn;
    }
    if (args.easeOut !== undefined) {
        options.easeOut = args.easeOut;
    }
    if (args.spatialTangentsIn !== undefined) {
        options.spatialTangentsIn = args.spatialTangentsIn;
    }
    if (args.spatialTangentsOut !== undefined) {
        options.spatialTangentsOut = args.spatialTangentsOut;
    }
    if (args.spatialContinuous !== undefined) {
        options.spatialContinuous = args.spatialContinuous;
    }
    if (args.spatialAutoBezier !== undefined) {
        options.spatialAutoBezier = args.spatialAutoBezier;
    }

    return options;
}

function applyKeyframeGraphOptions(property, keyIndex, options) {
    if (!options) {
        return;
    }

    var dimensionCount = getPropertyDimensionCount(property);

    if (options.easyEase) {
        var easyInfluence = (options.easyEaseInfluence !== undefined && options.easyEaseInfluence !== null)
            ? Number(options.easyEaseInfluence)
            : 33.333;
        var easyIn = buildEaseArray(dimensionCount, 0, easyInfluence);
        var easyOut = buildEaseArray(dimensionCount, 0, easyInfluence);
        property.setTemporalEaseAtKey(keyIndex, easyIn, easyOut);
    }

    if (options.easeIn || options.easeOut) {
        var inEase = buildEaseArrayFromSpec(dimensionCount, options.easeIn, 0, 33.333);
        var outEase = buildEaseArrayFromSpec(dimensionCount, options.easeOut, 0, 33.333);
        property.setTemporalEaseAtKey(keyIndex, inEase, outEase);
    }

    var inInterpolation = getInterpolationTypeByName(options.interpolationIn);
    var outInterpolation = getInterpolationTypeByName(options.interpolationOut);
    if (inInterpolation || outInterpolation) {
        if (!inInterpolation) {
            inInterpolation = property.keyInInterpolationType(keyIndex);
        }
        if (!outInterpolation) {
            outInterpolation = property.keyOutInterpolationType(keyIndex);
        }
        property.setInterpolationTypeAtKey(keyIndex, inInterpolation, outInterpolation);
    }

    if (options.temporalContinuous !== undefined) {
        property.setTemporalContinuousAtKey(keyIndex, !!options.temporalContinuous);
    }

    if (options.temporalAutoBezier !== undefined) {
        property.setTemporalAutoBezierAtKey(keyIndex, !!options.temporalAutoBezier);
    }

    if (options.roving !== undefined) {
        try {
            property.setRovingAtKey(keyIndex, !!options.roving);
        } catch (e) {
            
        }
    }

    if (options.spatialTangentsIn !== undefined || options.spatialTangentsOut !== undefined) {
        try {
            var inTangent = options.spatialTangentsIn;
            var outTangent = options.spatialTangentsOut;
            if (inTangent === undefined || inTangent === null) {
                inTangent = property.keyInSpatialTangent(keyIndex);
            }
            if (outTangent === undefined || outTangent === null) {
                outTangent = property.keyOutSpatialTangent(keyIndex);
            }
            property.setSpatialTangentsAtKey(keyIndex, inTangent, outTangent);
        } catch (e) {
            
        }
    }

    if (options.spatialContinuous !== undefined) {
        try {
            property.setSpatialContinuousAtKey(keyIndex, !!options.spatialContinuous);
        } catch (e) {
            
        }
    }

    if (options.spatialAutoBezier !== undefined) {
        try {
            property.setSpatialAutoBezierAtKey(keyIndex, !!options.spatialAutoBezier);
        } catch (e) {
            
        }
    }
}

function setEffectProperty(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var effect = resolveEffectOnLayer(resolved.layer, args || {});
        var propertyPath = normalizePropertyPath(args.propertyPath);
        var targetProperty = null;

        if (propertyPath.length > 0) {
            targetProperty = resolvePropertyPath(effect, propertyPath);
        }

        if (!targetProperty && args.propertyName) {
            targetProperty = findPropertyByNameOrMatchName(effect, args.propertyName);
        }

        if (!targetProperty && args.propertyIndex !== undefined && args.propertyIndex !== null) {
            targetProperty = effect.property(args.propertyIndex);
        }

        if (!targetProperty) {
            throw new Error("Target effect property not found. Provide propertyPath, propertyName, or propertyIndex.");
        }

        var previousValue = readPropertyValue(targetProperty);

        if (args.expressionString !== undefined && args.expressionString !== null) {
            if (!targetProperty.canSetExpression) {
                throw new Error("Property '" + targetProperty.name + "' does not support expressions.");
            }
            targetProperty.expression = args.expressionString;
        }

        var keyframeIndex = (args.keyframeIndex !== undefined && args.keyframeIndex !== null)
            ? Number(args.keyframeIndex)
            : -1;
        var keyframeApplied = false;

        if (args.value !== undefined) {
            if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
                if (!targetProperty.canVaryOverTime) {
                    throw new Error("Property '" + targetProperty.name + "' cannot be keyframed.");
                }
                targetProperty.setValueAtTime(args.timeInSeconds, coerceScriptValue(args.value));
            } else if (keyframeIndex > 0 && targetProperty.setValueAtKey) {
                targetProperty.setValueAtKey(keyframeIndex, coerceScriptValue(args.value));
            } else if (targetProperty.setValue) {
                targetProperty.setValue(coerceScriptValue(args.value));
            } else {
                throw new Error("Property '" + targetProperty.name + "' is not directly writable.");
            }
        }

        if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
            keyframeIndex = findKeyIndexAtTime(targetProperty, args.timeInSeconds);
            if (keyframeIndex < 0) {
                throw new Error("Could not find keyframe at the requested time after update.");
            }
        }

        var graphOptions = getKeyframeOptionsFromArgs(args);
        var hasGraphOptions = false;
        for (var graphKey in graphOptions) {
            if (graphOptions.hasOwnProperty(graphKey)) {
                hasGraphOptions = true;
                break;
            }
        }

        if (keyframeIndex > 0 && (hasGraphOptions || (args.timeInSeconds !== undefined && args.timeInSeconds !== null))) {
            applyKeyframeGraphOptions(targetProperty, keyframeIndex, graphOptions);
            keyframeApplied = true;
        }

        return JSON.stringify({
            status: "success",
            message: "Effect property updated successfully",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            effect: {
                index: effect.propertyIndex,
                name: effect.name,
                matchName: effect.matchName
            },
            property: {
                name: targetProperty.name,
                matchName: targetProperty.matchName,
                index: targetProperty.propertyIndex,
                previousValue: previousValue,
                currentValue: readPropertyValue(targetProperty),
                expressionEnabled: targetProperty.canSetExpression ? (targetProperty.expression !== "") : false,
                keyframeApplied: keyframeApplied,
                keyframeIndex: keyframeIndex
            },
            keyframeTimeInSeconds: (args.timeInSeconds !== undefined && args.timeInSeconds !== null) ? args.timeInSeconds : null
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function setEffectKeyframe(args) {
    if ((args.timeInSeconds === undefined || args.timeInSeconds === null) &&
        (args.keyframeIndex === undefined || args.keyframeIndex === null)) {
        return JSON.stringify({
            status: "error",
            message: "timeInSeconds or keyframeIndex is required for setEffectKeyframe"
        }, null, 2);
    }

    if (args.value === undefined) {
        return JSON.stringify({
            status: "error",
            message: "value is required for setEffectKeyframe"
        }, null, 2);
    }

    return setEffectProperty(args);
}

function applyLayerPreset(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var presetPath = args.presetPath;

        if (!presetPath) {
            throw new Error("presetPath is required.");
        }

        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            throw new Error("Preset file not found: " + presetPath);
        }

        resolved.layer.applyPreset(presetFile);

        return JSON.stringify({
            status: "success",
            message: "Preset applied successfully",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            presetPath: presetFile.fsName
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function createAdjustmentLayer(args) {
    try {
        var params = args || {};
        var compName = params.compName || "";
        var name = params.name || "Adjustment Layer";
        var position = params.position;
        var size = params.size;
        var startTime = params.startTime || 0;
        var duration = params.duration || 5;

        var comp = null;
        for (var i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === compName) {
                comp = item;
                break;
            }
        }

        if (!comp) {
            if (app.project.activeItem instanceof CompItem) {
                comp = app.project.activeItem;
            } else {
                throw new Error("No composition found with name '" + compName + "' and no active composition");
            }
        }

        if (!size) {
            size = [comp.width, comp.height];
        }

        if (!position) {
            position = [comp.width / 2, comp.height / 2];
        }

        var adjustmentLayer = comp.layers.addSolid([0, 0, 0], name, size[0], size[1], 1);
        adjustmentLayer.adjustmentLayer = true;
        adjustmentLayer.property("Position").setValue(position);
        adjustmentLayer.startTime = startTime;
        if (duration > 0) {
            adjustmentLayer.outPoint = startTime + duration;
        }

        return JSON.stringify({
            status: "success",
            message: "Adjustment layer created successfully",
            layer: {
                name: adjustmentLayer.name,
                index: adjustmentLayer.index,
                type: "adjustment",
                inPoint: adjustmentLayer.inPoint,
                outPoint: adjustmentLayer.outPoint,
                position: adjustmentLayer.property("Position").value,
                isAdjustment: adjustmentLayer.adjustmentLayer
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function centerLayers(args) {
    try {
        var params = args || {};
        var compIndex = resolveCompIndex(params);
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        var centerX = comp.width / 2;
        var centerY = comp.height / 2;
        var centered = [];

        function centerOneLayer(layer) {
            if (!layer) {
                return;
            }
            var positionProp = layer.property("Transform").property("Position");
            if (!positionProp || !positionProp.setValue) {
                return;
            }

            var current = positionProp.value;
            var nextValue = null;
            if (current instanceof Array && current.length >= 3) {
                nextValue = [centerX, centerY, current[2]];
            } else {
                nextValue = [centerX, centerY];
            }
            positionProp.setValue(nextValue);

            centered.push({
                index: layer.index,
                name: layer.name,
                position: nextValue
            });
        }

        if (params.allLayers) {
            for (var i = 1; i <= comp.numLayers; i++) {
                centerOneLayer(comp.layer(i));
            }
        } else if (params.selectedOnly) {
            var selected = comp.selectedLayers || [];
            for (var j = 0; j < selected.length; j++) {
                centerOneLayer(selected[j]);
            }
        } else if (params.layerName) {
            var target = null;
            for (var k = 1; k <= comp.numLayers; k++) {
                if (comp.layer(k).name === params.layerName) {
                    target = comp.layer(k);
                    break;
                }
            }
            if (!target) {
                throw new Error("Layer not found with name '" + params.layerName + "'.");
            }
            centerOneLayer(target);
        } else {
            centerOneLayer(comp.layer(params.layerIndex || 1));
        }

        return JSON.stringify({
            status: "success",
            message: "Layer centering completed",
            composition: {
                name: comp.name,
                index: compIndex,
                center: [centerX, centerY]
            },
            centeredCount: centered.length,
            centeredLayers: centered
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getLayerClipFrames(args) {
    try {
        var params = args || {};
        var compIndex = resolveCompIndex(params);
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            if (params.layerIndex > 0 && params.layerIndex <= comp.numLayers) {
                layer = comp.layer(params.layerIndex);
            } else {
                throw new Error("Layer index out of bounds: " + params.layerIndex);
            }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) {
                    layer = comp.layer(i);
                    break;
                }
            }
            if (!layer) {
                throw new Error("Layer not found with name '" + params.layerName + "'.");
            }
        } else {
            throw new Error("Provide layerIndex or layerName.");
        }

        var frameDuration = comp.frameDuration;
        function toFrameNumber(timeValue) {
            return Math.round(timeValue / frameDuration);
        }

        var clipStartTime = layer.inPoint;
        var clipEndTime = layer.outPoint;
        var layerStartTime = layer.startTime;
        var sourceStartTime = layer.inPoint - layer.startTime;
        var sourceEndTime = layer.outPoint - layer.startTime;

        return JSON.stringify({
            status: "success",
            composition: {
                name: comp.name,
                index: compIndex,
                frameRate: comp.frameRate,
                frameDuration: frameDuration
            },
            layer: {
                name: layer.name,
                index: layer.index,
                sourceName: layer.source ? layer.source.name : null,
                startTimeSeconds: layerStartTime,
                startFrame: toFrameNumber(layerStartTime),
                clipStartTimeSeconds: clipStartTime,
                clipStartFrame: toFrameNumber(clipStartTime),
                clipEndTimeSeconds: clipEndTime,
                clipEndFrame: toFrameNumber(clipEndTime),
                sourceStartTimeSeconds: sourceStartTime,
                sourceStartFrame: toFrameNumber(sourceStartTime),
                sourceEndTimeSeconds: sourceEndTime,
                sourceEndFrame: toFrameNumber(sourceEndTime),
                durationSeconds: clipEndTime - clipStartTime,
                durationFrames: toFrameNumber(clipEndTime - clipStartTime)
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}

function getLayerAudioInfo(args) {
    try {
        var params = args || {};
        var compIndex = resolveCompIndex(params);
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            layer = comp.layer(params.layerIndex);
            if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
            }
            if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
        } else {
            throw new Error("Provide layerIndex or layerName.");
        }

        var hasAudio = layer.hasAudio || false;
        var audioEnabled = layer.audioEnabled || false;
        var sourceInfo = null;
        var sourceFilePath = null;

        if (layer.source) {
            var src = layer.source;
            sourceInfo = {
                name: src.name,
                hasAudio: src.hasAudio || false,
                audioChannels: src.audioChannels || 0,
                audioSampleRate: src.audioSampleRate || 0,
                audioDuration: src.audioDuration || 0
            };
            if (src.file) {
                sourceFilePath = src.file.fsName;
            }
        }

        var audioLevelsValue = null;
        var audioLevelsKeyframes = [];
        try {
            var audioGroup = layer.property("Audio");
            if (audioGroup) {
                var levProp = null;
                try { levProp = audioGroup.property("Audio Levels"); } catch (e) {}
                if (!levProp) {
                    for (var j = 1; j <= audioGroup.numProperties; j++) {
                        var ap = audioGroup.property(j);
                        if (ap.matchName === "ADBE Audio Levels" || ap.name === "Audio Levels") {
                            levProp = ap; break;
                        }
                    }
                }
                if (levProp) {
                    audioLevelsValue = levProp.value;
                    for (var k = 1; k <= levProp.numKeys; k++) {
                        audioLevelsKeyframes.push({
                            index: k,
                            timeInSeconds: levProp.keyTime(k),
                            value: levProp.keyValue(k)
                        });
                    }
                }
            }
        } catch (e) {}

        var existingMarkers = [];
        try {
            var markerProp = layer.property("Marker");
            if (markerProp) {
                for (var m = 1; m <= markerProp.numKeys; m++) {
                    var mv = markerProp.keyValue(m);
                    existingMarkers.push({
                        index: m,
                        timeInSeconds: markerProp.keyTime(m),
                        comment: mv.comment,
                        duration: mv.duration,
                        label: mv.label
                    });
                }
            }
        } catch (e) {}

        return JSON.stringify({
            status: "success",
            composition: { name: comp.name, index: compIndex, frameRate: comp.frameRate },
            layer: {
                name: layer.name,
                index: layer.index,
                hasAudio: hasAudio,
                audioEnabled: audioEnabled,
                inPoint: layer.inPoint,
                outPoint: layer.outPoint
            },
            source: sourceInfo,
            sourceFilePath: sourceFilePath,
            audioLevels: { currentValue: audioLevelsValue, keyframes: audioLevelsKeyframes },
            existingMarkers: existingMarkers
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function addMarkersFromArray(args) {
    try {
        var params = args || {};
        var compIndex = resolveCompIndex(params);
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var markers = params.markers;
        if (!markers || !(markers instanceof Array) || markers.length === 0) {
            throw new Error("markers must be a non-empty array of {timeInSeconds, comment?, duration?, label?} objects.");
        }

        var markerType = params.markerType || "layer";
        var layer = null;

        if (markerType === "layer") {
            if (params.layerIndex !== undefined && params.layerIndex !== null) {
                layer = comp.layer(params.layerIndex);
                if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
            } else if (params.layerName) {
                for (var i = 1; i <= comp.numLayers; i++) {
                    if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
                }
                if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
            } else {
                throw new Error("Provide layerIndex or layerName for layer markers, or set markerType to 'comp'.");
            }
        }

        var added = [];
        var errors = [];

        for (var j = 0; j < markers.length; j++) {
            try {
                var spec = markers[j];
                var timeInSeconds = Number(spec.timeInSeconds);
                var mv = new MarkerValue(spec.comment || "");
                mv.duration = (spec.duration !== undefined && spec.duration !== null) ? Number(spec.duration) : 0;
                if (spec.chapter)  { mv.chapter = spec.chapter; }
                if (spec.url)      { mv.url     = spec.url;     }
                if (spec.label)    { mv.label   = Number(spec.label); }

                if (markerType === "comp") {
                    comp.markerProperty.setValueAtTime(timeInSeconds, mv);
                } else {
                    layer.property("Marker").setValueAtTime(timeInSeconds, mv);
                }
                added.push({ timeInSeconds: timeInSeconds, comment: spec.comment || "" });
            } catch (e) {
                errors.push({ index: j, timeInSeconds: markers[j].timeInSeconds, error: e.toString() });
            }
        }

        return JSON.stringify({
            status: "success",
            message: "Bulk marker insertion complete",
            addedCount: added.length,
            errorCount: errors.length,
            added: added,
            errors: errors,
            composition: { name: comp.name, index: compIndex },
            layer: layer ? { name: layer.name, index: layer.index } : null
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function addMarker(args) {
    try {
        var params = args || {};
        var compIndex = resolveCompIndex(params);
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }

        var timeInSeconds = (params.timeInSeconds !== undefined && params.timeInSeconds !== null)
            ? Number(params.timeInSeconds)
            : comp.time;

        var comment  = params.comment  || "";
        var chapter  = params.chapter  || "";
        var url      = params.url      || "";
        var duration = (params.duration !== undefined && params.duration !== null) ? Number(params.duration) : 0;
        var label    = (params.label   !== undefined && params.label   !== null) ? Number(params.label)   : 0;

        var markerVal = new MarkerValue(comment);
        markerVal.duration = duration;
        if (chapter)  { markerVal.chapter    = chapter;  }
        if (url)      { markerVal.url        = url;      }
        if (label)    { markerVal.label      = label;    }

        var markerType = params.markerType || "layer"; 

        if (markerType === "comp") {
            comp.markerProperty.setValueAtTime(timeInSeconds, markerVal);
            return JSON.stringify({
                status: "success",
                message: "Composition marker added",
                composition: { name: comp.name, index: compIndex },
                marker: { timeInSeconds: timeInSeconds, comment: comment, duration: duration, label: label }
            }, null, 2);
        }

        
        var layer = null;
        if (params.layerIndex !== undefined && params.layerIndex !== null) {
            layer = comp.layer(params.layerIndex);
            if (!layer) { throw new Error("Layer not found at index " + params.layerIndex); }
        } else if (params.layerName) {
            for (var i = 1; i <= comp.numLayers; i++) {
                if (comp.layer(i).name === params.layerName) { layer = comp.layer(i); break; }
            }
            if (!layer) { throw new Error("Layer not found with name '" + params.layerName + "'."); }
        } else {
            throw new Error("Provide layerIndex or layerName for a layer marker, or set markerType to 'comp'.");
        }

        var markerProp = layer.property("Marker");
        if (!markerProp) { throw new Error("Layer '" + layer.name + "' does not support markers."); }
        markerProp.setValueAtTime(timeInSeconds, markerVal);

        return JSON.stringify({
            status: "success",
            message: "Layer marker added",
            composition: { name: comp.name, index: compIndex },
            layer: { name: layer.name, index: layer.index },
            marker: { timeInSeconds: timeInSeconds, comment: comment, duration: duration, label: label }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function setLayerAudioLevels(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var layer = resolved.layer;

        var audioGroup = layer.property("Audio");
        if (!audioGroup) {
            throw new Error("Layer '" + layer.name + "' has no Audio property. Ensure it is an audio or AV layer.");
        }

        
        var audioLevelsProp = null;
        try { audioLevelsProp = audioGroup.property("Audio Levels"); } catch (e) {}
        if (!audioLevelsProp) {
            for (var i = 1; i <= audioGroup.numProperties; i++) {
                var p = audioGroup.property(i);
                if (p.matchName === "ADBE Audio Levels" || p.name === "Audio Levels") {
                    audioLevelsProp = p;
                    break;
                }
            }
        }
        if (!audioLevelsProp) {
            throw new Error("Audio Levels property not found on layer '" + layer.name + "'.");
        }

        var level      = (args.level      !== undefined && args.level      !== null) ? Number(args.level)      : null;
        var leftLevel  = (args.leftLevel  !== undefined && args.leftLevel  !== null) ? Number(args.leftLevel)  : level;
        var rightLevel = (args.rightLevel !== undefined && args.rightLevel !== null) ? Number(args.rightLevel) : level;

        if (leftLevel === null && rightLevel === null) {
            throw new Error("Provide level (both channels), leftLevel, or rightLevel in dB.");
        }
        if (leftLevel  === null) { leftLevel  = rightLevel; }
        if (rightLevel === null) { rightLevel = leftLevel;  }

        var levelsValue = [leftLevel, rightLevel];

        if (args.timeInSeconds !== undefined && args.timeInSeconds !== null) {
            if (!audioLevelsProp.canVaryOverTime) {
                throw new Error("Audio Levels property cannot be keyframed on this layer.");
            }
            audioLevelsProp.setValueAtTime(Number(args.timeInSeconds), levelsValue);
        } else {
            audioLevelsProp.setValue(levelsValue);
        }

        return JSON.stringify({
            status: "success",
            message: "Audio levels set successfully",
            composition: { name: resolved.comp.name, index: resolved.compIndex },
            layer: { name: layer.name, index: layer.index },
            audioLevels: {
                left: leftLevel,
                right: rightLevel,
                timeInSeconds: (args.timeInSeconds !== undefined && args.timeInSeconds !== null) ? Number(args.timeInSeconds) : null
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({ status: "error", message: error.toString() }, null, 2);
    }
}

function removeLayerEffect(args) {
    try {
        var resolved = resolveCompAndLayer(args || {});
        var effectsGroup = resolved.layer.property("Effects");

        if (!effectsGroup || effectsGroup.numProperties === 0) {
            return JSON.stringify({
                status: "success",
                message: "Layer has no effects to remove",
                removedCount: 0
            }, null, 2);
        }

        var removeAll = !!args.removeAll;
        var removedEffects = [];

        if (removeAll) {
            for (var i = effectsGroup.numProperties; i >= 1; i--) {
                var current = effectsGroup.property(i);
                removedEffects.push({
                    index: current.propertyIndex,
                    name: current.name,
                    matchName: current.matchName
                });
                current.remove();
            }
        } else {
            var effect = resolveEffectOnLayer(resolved.layer, args || {});
            removedEffects.push({
                index: effect.propertyIndex,
                name: effect.name,
                matchName: effect.matchName
            });
            effect.remove();
        }

        return JSON.stringify({
            status: "success",
            message: "Effect removal completed",
            composition: {
                name: resolved.comp.name,
                index: resolved.compIndex
            },
            layer: {
                name: resolved.layer.name,
                index: resolved.layerIndex
            },
            removedCount: removedEffects.length,
            removedEffects: removedEffects
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}


function applyEffectTemplate(args) {
    try {
        
        var compIndex = resolveCompIndex(args); 
        var layerIndex = args.layerIndex || 1; 
        var templateName = args.templateName; 
        var customSettings = args.customSettings || {}; 
        
        if (!templateName) {
            throw new Error("You must specify a templateName");
        }
        
        
        var comp = app.project.item(compIndex);
        if (!comp || !(comp instanceof CompItem)) {
            throw new Error("Composition not found at index " + compIndex);
        }
        
        
        var layer = comp.layer(layerIndex);
        if (!layer) {
            throw new Error("Layer not found at index " + layerIndex + " in composition '" + comp.name + "'");
        }
        
        
        var templates = {
            
            "gaussian-blur": {
                effectMatchName: "ADBE Gaussian Blur 2",
                settings: {
                    "Blurriness": customSettings.blurriness || 20
                }
            },
            "directional-blur": {
                effectMatchName: "ADBE Directional Blur",
                settings: {
                    "Direction": customSettings.direction || 0,
                    "Blur Length": customSettings.length || 10
                }
            },
            
            
            "color-balance": {
                effectMatchName: "ADBE Color Balance (HLS)",
                settings: {
                    "Hue": customSettings.hue || 0,
                    "Lightness": customSettings.lightness || 0,
                    "Saturation": customSettings.saturation || 0
                }
            },
            "brightness-contrast": {
                effectMatchName: "ADBE Brightness & Contrast 2",
                settings: {
                    "Brightness": customSettings.brightness || 0,
                    "Contrast": customSettings.contrast || 0,
                    "Use Legacy": false
                }
            },
            "curves": {
                effectMatchName: "ADBE CurvesCustom",
                
            },
            
            
            "glow": {
                effectMatchName: "ADBE Glow",
                settings: {
                    "Glow Threshold": customSettings.threshold || 50,
                    "Glow Radius": customSettings.radius || 15,
                    "Glow Intensity": customSettings.intensity || 1
                }
            },
            "drop-shadow": {
                effectMatchName: "ADBE Drop Shadow",
                settings: {
                    "Shadow Color": customSettings.color || [0, 0, 0, 1],
                    "Opacity": customSettings.opacity || 50,
                    "Direction": customSettings.direction || 135,
                    "Distance": customSettings.distance || 10,
                    "Softness": customSettings.softness || 10
                }
            },
            
            
            "cinematic-look": {
                effects: [
                    {
                        effectMatchName: "ADBE CurvesCustom",
                        settings: {}
                    },
                    {
                        effectMatchName: "ADBE Vibrance",
                        settings: {
                            "Vibrance": 15,
                            "Saturation": -5
                        }
                    }
                ]
            },
            "text-pop": {
                effects: [
                    {
                        effectMatchName: "ADBE Drop Shadow",
                        settings: {
                            "Shadow Color": [0, 0, 0, 1],
                            "Opacity": 75,
                            "Distance": 5,
                            "Softness": 10
                        }
                    },
                    {
                        effectMatchName: "ADBE Glow",
                        settings: {
                            "Glow Threshold": 50,
                            "Glow Radius": 10,
                            "Glow Intensity": 1.5
                        }
                    }
                ]
            }
        };
        
        
        var template = templates[templateName];
        if (!template) {
            var templateNames = [];
            for (var templateKey in templates) {
                if (templates.hasOwnProperty(templateKey)) {
                    templateNames.push(templateKey);
                }
            }
            var availableTemplates = templateNames.join(", ");
            throw new Error("Template '" + templateName + "' not found. Available templates: " + availableTemplates);
        }
        
        var appliedEffects = [];
        
        
        if (template.effectMatchName) {
            
            var effect = layer.Effects.addProperty(template.effectMatchName);
            
            
            for (var propName in template.settings) {
                try {
                    var property = effect.property(propName);
                    if (property) {
                        property.setValue(template.settings[propName]);
                    }
                } catch (e) {
                    $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                }
            }
            
            appliedEffects.push({
                name: effect.name,
                matchName: effect.matchName
            });
        } else if (template.effects) {
            
            for (var i = 0; i < template.effects.length; i++) {
                var effectData = template.effects[i];
                var effect = layer.Effects.addProperty(effectData.effectMatchName);
                
                
                for (var propName in effectData.settings) {
                    try {
                        var property = effect.property(propName);
                        if (property) {
                            property.setValue(effectData.settings[propName]);
                        }
                    } catch (e) {
                        $.writeln("Warning: Could not set " + propName + " on effect " + effect.name + ": " + e);
                    }
                }
                
                appliedEffects.push({
                    name: effect.name,
                    matchName: effect.matchName
                });
            }
        }
        
        return JSON.stringify({
            status: "success",
            message: "Effect template '" + templateName + "' applied successfully",
            appliedEffects: appliedEffects,
            layer: {
                name: layer.name,
                index: layerIndex
            },
            composition: {
                name: comp.name,
                index: compIndex
            }
        }, null, 2);
    } catch (error) {
        return JSON.stringify({
            status: "error",
            message: error.toString()
        }, null, 2);
    }
}




function bridgeTestEffects(args) {
    try {
        var compIndex = (args && args.compIndex) ? args.compIndex : 1;
        var layerIndex = (args && args.layerIndex) ? args.layerIndex : 1;

        
        var blurRes = JSON.parse(applyEffect({
            compIndex: compIndex,
            layerIndex: layerIndex,
            effectMatchName: "ADBE Gaussian Blur 2",
            effectSettings: { "Blurriness": 5 }
        }));

        
        var shadowRes = JSON.parse(applyEffectTemplate({
            compIndex: compIndex,
            layerIndex: layerIndex,
            templateName: "drop-shadow"
        }));

        return JSON.stringify({
            status: "success",
            message: "Bridge test effects applied.",
            results: [blurRes, shadowRes]
        }, null, 2);
    } catch (e) {
        return JSON.stringify({ status: "error", message: e.toString() }, null, 2);
    }
}


if (typeof JSON === "undefined") {
    JSON = {};
}
if (typeof JSON.parse !== "function") {
    JSON.parse = function (text) {
        
        return eval("(" + text + ")");
    };
}
if (typeof JSON.stringify !== "function") {
    (function () {
        function esc(str) {
            return (str + "")
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\n/g, "\\n")
                .replace(/\r/g, "\\r")
                .replace(/\t/g, "\\t");
        }
        function toJSON(val) {
            if (val === null) return "null";
            var t = typeof val;
            if (t === "number" || t === "boolean") return String(val);
            if (t === "string") return '"' + esc(val) + '"';
            if (val instanceof Array) {
                var a = [];
                for (var i = 0; i < val.length; i++) a.push(toJSON(val[i]));
                return "[" + a.join(",") + "]";
            }
            if (t === "object") {
                var props = [];
                for (var k in val) {
                    if (val.hasOwnProperty(k) && typeof val[k] !== "function" && typeof val[k] !== "undefined") {
                        props.push('"' + esc(k) + '":' + toJSON(val[k]));
                    }
                }
                return "{" + props.join(",") + "}";
            }
            return "null";
        }
        JSON.stringify = function (value, _replacer, _space) {
            return toJSON(value);
        };
    })();
}
var aeVersion = parseFloat(app.version);
var isAE2025OrLater = aeVersion >= 25.0;
// The Claude CEP panel loads this file with MCP_HEADLESS = true and calls
// mcpHttpExecute directly, so no palette window or file polling is needed
var MCP_HEADLESS = (typeof MCP_HEADLESS !== "undefined" && MCP_HEADLESS === true);
if (!MCP_HEADLESS) {
    var panel = new Window("palette", "MCP Bridge Auto", undefined);
    panel.orientation = "column";
    panel.alignChildren = ["fill", "top"];
    panel.spacing = 10;
    panel.margins = 16;
    var statusText = panel.add("statictext", undefined, "Waiting for commands...");
    statusText.alignment = ["fill", "top"];
    var logPanel = panel.add("panel", undefined, "Command Log");
    logPanel.orientation = "column";
    logPanel.alignChildren = ["fill", "fill"];
    var logText = logPanel.add("edittext", undefined, "", {multiline: true, readonly: true});
    logText.preferredSize.height = 200;
    if (isAE2025OrLater) {
        var warning = panel.add("statictext", undefined, "AE 2025+: Dockable panels are not supported. Floating window only.");
        warning.graphics.foregroundColor = warning.graphics.newPen(warning.graphics.PenType.SOLID_COLOR, [1,0.3,0,1], 1);
    }
    var autoRunCheckbox = panel.add("checkbox", undefined, "Auto-run commands");
    autoRunCheckbox.value = true;
} else if (!(typeof panel !== "undefined" && panel instanceof Window)) {
    // Keep a palette's real UI if one is already open in this engine
    var panel = { update: function () {} };
    var statusText = { text: "" };
    var logText = { text: "" };
    var autoRunCheckbox = { value: false };
}
var checkInterval = 400;
var isChecking = false;

// Commands that only read state; everything else is wrapped in an undo group
var READ_ONLY_COMMANDS = {
    getProjectInfo: true,
    listProjectItems: true,
    listCompositions: true,
    getLayerInfo: true,
    listLayerEffects: true,
    listAvailableEffects: true,
    getLayerClipFrames: true,
    getLayerAudioInfo: true,
    renderFrames: true,
    getLayerSourceInfo: true,
    getMarkers: true
};

// ExtendScript's Date has no toISOString
function isoNow() {
    var d = new Date();
    function pad(n, w) {
        var s = String(n);
        while (s.length < (w || 2)) { s = "0" + s; }
        return s;
    }
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
        "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) +
        "." + pad(d.getUTCMilliseconds(), 3) + "Z";
}

// Resolves a project item index from compName, compIndex, or the active comp
function resolveCompIndex(args) {
    args = args || {};
    var i;
    if (args.compName) {
        for (i = 1; i <= app.project.numItems; i++) {
            var item = app.project.item(i);
            if (item instanceof CompItem && item.name === args.compName) {
                return i;
            }
        }
        throw new Error("No composition named '" + args.compName + "'");
    }
    if (args.compIndex) {
        return args.compIndex;
    }
    var active = app.project.activeItem;
    if (active instanceof CompItem) {
        for (i = 1; i <= app.project.numItems; i++) {
            if (app.project.item(i).id === active.id) {
                return i;
            }
        }
    }
    return 1;
}
function getCommandFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_command.json";
}
function getResultFilePath() {
    var userFolder = Folder.myDocuments;
    var bridgeFolder = new Folder(userFolder.fsName + "/ae-mcp-bridge");
    if (!bridgeFolder.exists) {
        bridgeFolder.create();
    }
    return bridgeFolder.fsName + "/ae_mcp_result.json";
}
function getProjectInfo() {
    var project = app.project;
    var result = {
        projectName: project.file ? project.file.name : "Untitled Project",
        path: project.file ? project.file.fsName : "",
        numItems: project.numItems,
        bitsPerChannel: project.bitsPerChannel,
        timeMode: project.timeDisplayType === TimeDisplayType.FRAMES ? "Frames" : "Timecode",
        items: []
    };
    var countByType = {
        compositions: 0,
        footage: 0,
        folders: 0,
        solids: 0
    };
    for (var i = 1; i <= Math.min(project.numItems, 50); i++) {
        var item = project.item(i);
        var itemType = "";
        
        if (item instanceof CompItem) {
            itemType = "Composition";
            countByType.compositions++;
        } else if (item instanceof FolderItem) {
            itemType = "Folder";
            countByType.folders++;
        } else if (item instanceof FootageItem) {
            if (item.mainSource instanceof SolidSource) {
                itemType = "Solid";
                countByType.solids++;
            } else {
                itemType = "Footage";
                countByType.footage++;
            }
        }
        
        result.items.push({
            id: item.id,
            name: item.name,
            type: itemType
        });
    }
    
    result.itemCounts = countByType;
    if (app.project.activeItem instanceof CompItem) {
        var ac = app.project.activeItem;
        result.activeComp = {
            id: ac.id,
            name: ac.name,
            width: ac.width,
            height: ac.height,
            duration: ac.duration,
            frameRate: ac.frameRate,
            numLayers: ac.numLayers
        };
    }

    return JSON.stringify(result, null, 2);
}

function listCompositions() {
    var project = app.project;
    var result = {
        compositions: []
    };
    for (var i = 1; i <= project.numItems; i++) {
        var item = project.item(i);
        if (item instanceof CompItem) {
            result.compositions.push({
                compIndex: i,
                id: item.id,
                name: item.name,
                duration: item.duration,
                frameRate: item.frameRate,
                width: item.width,
                height: item.height,
                numLayers: item.numLayers
            });
        }
    }
    
    return JSON.stringify(result, null, 2);
}

function getLayerType(layer) {
    if (layer instanceof TextLayer) return "text";
    if (layer instanceof ShapeLayer) return "shape";
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer) return "light";
    if (layer.adjustmentLayer) return "adjustment";
    if (layer.nullLayer) return "null";
    if (layer.source instanceof CompItem) return "precomp";
    if (layer.source && layer.source.mainSource instanceof SolidSource) return "solid";
    if (layer.source) return "footage";
    return "unknown";
}

function getLayerInfo(args) {
    if (!(args && (args.compIndex || args.compName)) && !(app.project.activeItem instanceof CompItem)) {
        return JSON.stringify({ status: "error", message: "No active composition. Pass compIndex or compName." }, null, 2);
    }
    var compIndex = resolveCompIndex(args);
    var comp = app.project.item(compIndex);
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({ status: "error", message: "Project item " + compIndex + " is not a composition." }, null, 2);
    }
    var result = {
        composition: { name: comp.name, compIndex: compIndex },
        layers: []
    };
    for (var i = 1; i <= comp.numLayers; i++) {
        var layer = comp.layer(i);
        result.layers.push({
            index: layer.index,
            name: layer.name,
            type: getLayerType(layer),
            enabled: layer.enabled,
            locked: layer.locked,
            parentIndex: layer.parent ? layer.parent.index : null,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint
        });
    }

    return JSON.stringify(result, null, 2);
}
function padNumber(n, width) {
    var s = String(n);
    while (s.length < width) {
        s = "0" + s;
    }
    return s;
}

function resolveLayerInComp(comp, args) {
    if (args.layerName) {
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name === args.layerName) {
                return comp.layer(i);
            }
        }
        throw new Error("No layer named '" + args.layerName + "' in composition '" + comp.name + "'");
    }
    var index = args.layerIndex || 1;
    if (index > comp.numLayers) {
        throw new Error("Layer index " + index + " is out of range (comp has " + comp.numLayers + " layers)");
    }
    return comp.layer(index);
}

function resolveCompItem(args) {
    var compIndex = resolveCompIndex(args);
    var comp = app.project.item(compIndex);
    if (!(comp instanceof CompItem)) {
        throw new Error("Project item " + compIndex + " is not a composition.");
    }
    return { comp: comp, compIndex: compIndex };
}

// Sets in/out without tripping AE's in < out checks, whatever the current values are
function setLayerSpan(layer, inPoint, outPoint) {
    layer.outPoint = Math.max(outPoint, layer.inPoint + layer.containingComp.frameDuration);
    layer.inPoint = inPoint;
    layer.outPoint = outPoint;
}

function getLayerSourceInfo(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var layer = resolveLayerInComp(comp, args);
    var source = layer.source;
    var filePath = (source && source.mainSource && source.mainSource.file) ? source.mainSource.file.fsName : null;
    return JSON.stringify({
        status: "success",
        composition: { name: comp.name, compIndex: resolved.compIndex, frameRate: comp.frameRate, frameDuration: comp.frameDuration },
        layer: {
            index: layer.index,
            name: layer.name,
            startTime: layer.startTime,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            stretch: layer.stretch,
            timeRemapEnabled: layer.timeRemapEnabled
        },
        sourceFilePath: filePath,
        sourceFrameRate: source && source.frameRate ? source.frameRate : null
    }, null, 2);
}

// Splits one layer into consecutive shot layers at the given comp frames
function splitLayer(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var layer = resolveLayerInComp(comp, args);
    var fd = comp.frameDuration;
    var inFrame = Math.round(layer.inPoint / fd);
    var outFrame = Math.round(layer.outPoint / fd);

    var raw = [];
    var i;
    if (args.cutFrames) {
        for (i = 0; i < args.cutFrames.length; i++) raw.push(Math.round(args.cutFrames[i]));
    }
    if (args.cutTimes) {
        for (i = 0; i < args.cutTimes.length; i++) raw.push(Math.round(args.cutTimes[i] / fd));
    }
    raw.sort(function (a, b) { return a - b; });
    var cuts = [];
    for (i = 0; i < raw.length; i++) {
        if (raw[i] > inFrame && raw[i] < outFrame && (cuts.length === 0 || cuts[cuts.length - 1] !== raw[i])) {
            cuts.push(raw[i]);
        }
    }
    if (cuts.length === 0) {
        throw new Error("No cut points fall inside the layer (frames " + inFrame + "-" + outFrame + ").");
    }

    var bounds = [inFrame].concat(cuts).concat([outFrame]);
    var prefix = args.namePrefix || "Shot";
    var digits = Math.max(2, String(bounds.length - 1).length);

    var shots = [layer];
    for (i = 2; i < bounds.length; i++) {
        shots.push(layer.duplicate());
    }
    var result = [];
    for (i = 0; i < shots.length; i++) {
        var shot = shots[i];
        setLayerSpan(shot, bounds[i] * fd, bounds[i + 1] * fd);
        shot.name = prefix + " " + padNumber(i + 1, digits);
        if (i > 0) {
            shot.moveAfter(shots[i - 1]);
        }
    }
    for (i = 0; i < shots.length; i++) {
        result.push({
            shot: i + 1,
            layerIndex: shots[i].index,
            name: shots[i].name,
            inFrame: bounds[i],
            outFrame: bounds[i + 1],
            inPoint: shots[i].inPoint,
            outPoint: shots[i].outPoint
        });
    }
    return JSON.stringify({
        status: "success",
        composition: { name: comp.name, compIndex: resolved.compIndex },
        shotCount: shots.length,
        shots: result
    }, null, 2);
}

// Batch-edits simple layer state: enabled, audio, label, name, solo, lock
function updateLayers(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var updates = args.layers || [];
    var results = [];
    for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        var layer = resolveLayerInComp(comp, u);
        if (u.enabled !== undefined) layer.enabled = u.enabled;
        if (u.audioEnabled !== undefined && layer.hasAudio) layer.audioEnabled = u.audioEnabled;
        if (u.solo !== undefined) layer.solo = u.solo;
        if (u.locked !== undefined) layer.locked = u.locked;
        if (u.label !== undefined) layer.label = u.label;
        if (u.name !== undefined) layer.name = u.name;
        results.push({
            layerIndex: layer.index,
            name: layer.name,
            enabled: layer.enabled,
            audioEnabled: layer.hasAudio ? layer.audioEnabled : null,
            label: layer.label
        });
    }
    return JSON.stringify({ status: "success", composition: { name: comp.name, compIndex: resolved.compIndex }, layers: results }, null, 2);
}

// Slides enabled layers back to back in time order, closing the gaps left by disabled ones
function closeGaps(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var fd = comp.frameDuration;
    var candidates = [];
    var i;
    if (args.layerIndices && args.layerIndices.length) {
        for (i = 0; i < args.layerIndices.length; i++) candidates.push(comp.layer(args.layerIndices[i]));
    } else if (args.namePrefix) {
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name.indexOf(args.namePrefix) === 0) candidates.push(comp.layer(i));
        }
    } else {
        throw new Error("Pass layerIndices or namePrefix to choose which layers to pack.");
    }

    var active = [];
    var skipped = [];
    for (i = 0; i < candidates.length; i++) {
        if (candidates[i].enabled) active.push(candidates[i]);
        else skipped.push(candidates[i].name);
    }
    active.sort(function (a, b) { return a.inPoint - b.inPoint; });
    if (active.length === 0) {
        throw new Error("None of the selected layers are enabled.");
    }

    var cursorFrame = args.startTime !== undefined ? Math.round(args.startTime / fd) : Math.round(active[0].inPoint / fd);
    var moved = [];
    for (i = 0; i < active.length; i++) {
        var L = active[i];
        var shiftFrames = cursorFrame - Math.round(L.inPoint / fd);
        if (shiftFrames !== 0) {
            L.startTime = L.startTime + shiftFrames * fd;
        }
        moved.push({ layerIndex: L.index, name: L.name, shiftFrames: shiftFrames, inPoint: L.inPoint, outPoint: L.outPoint });
        cursorFrame = Math.round(L.outPoint / fd);
    }
    return JSON.stringify({
        status: "success",
        composition: { name: comp.name, compIndex: resolved.compIndex },
        endTime: cursorFrame * fd,
        layers: moved,
        disabledLeftInPlace: skipped
    }, null, 2);
}

function readMarkerProperty(markerProp) {
    var out = [];
    if (!markerProp) return out;
    for (var m = 1; m <= markerProp.numKeys; m++) {
        var mv = markerProp.keyValue(m);
        out.push({ timeInSeconds: markerProp.keyTime(m), comment: mv.comment, duration: mv.duration, label: mv.label });
    }
    return out;
}

// Comp markers plus the markers on every layer that has any
function getMarkers(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var layers = [];
    for (var i = 1; i <= comp.numLayers; i++) {
        var L = comp.layer(i);
        var markers = readMarkerProperty(L.property("Marker"));
        if (markers.length) layers.push({ layerIndex: i, name: L.name, hasAudio: L.hasAudio, markers: markers });
    }
    return JSON.stringify({
        status: "success",
        composition: { name: comp.name, compIndex: resolved.compIndex, frameRate: comp.frameRate, duration: comp.duration },
        compMarkers: readMarkerProperty(comp.markerProperty),
        layerMarkers: layers
    }, null, 2);
}

// Seeded so a shuffle can be reproduced (Park-Miller; products stay exact in doubles, ExtendScript has no Math.imul)
function makeRandom(seed) {
    var a = Math.abs(Math.floor(seed)) % 2147483647;
    if (a === 0) a = 1;
    return function () {
        a = (a * 16807) % 2147483647;
        return (a - 1) / 2147483646;
    };
}

// Optionally shuffles the shots, then lays them back to back with every cut on a marker.
// Each shot keeps its source in-point; its out-point runs on in the source until the next marker.
function cutToMarkers(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var fd = comp.frameDuration;
    var i;

    var markers;
    var markerSource;
    if (args.markerLayerIndex || args.markerLayerName) {
        var markerLayer = resolveLayerInComp(comp, { layerIndex: args.markerLayerIndex, layerName: args.markerLayerName });
        markers = readMarkerProperty(markerLayer.property("Marker"));
        markerSource = "layer: " + markerLayer.name;
    } else {
        markers = readMarkerProperty(comp.markerProperty);
        markerSource = "composition";
    }

    var shots = [];
    var skipped = [];
    var candidates = [];
    if (args.layerIndices && args.layerIndices.length) {
        for (i = 0; i < args.layerIndices.length; i++) candidates.push(comp.layer(args.layerIndices[i]));
    } else if (args.namePrefix) {
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).name.indexOf(args.namePrefix) === 0) candidates.push(comp.layer(i));
        }
    } else {
        throw new Error("Pass layerIndices or namePrefix to choose which shots to cut.");
    }
    for (i = 0; i < candidates.length; i++) {
        if (candidates[i].enabled) shots.push(candidates[i]);
        else skipped.push(candidates[i].name);
    }
    if (shots.length === 0) throw new Error("None of the selected layers are enabled.");
    shots.sort(function (a, b) { return a.inPoint - b.inPoint; });

    var startFrame = args.startTime !== undefined ? Math.round(args.startTime / fd) : Math.round(shots[0].inPoint / fd);
    var topIndex = shots[0].index;
    for (i = 1; i < shots.length; i++) topIndex = Math.min(topIndex, shots[i].index);

    var seed = null;
    if (args.shuffle !== false) {
        seed = args.seed !== undefined ? args.seed : Math.floor(Math.random() * 2147483647);
        var rand = makeRandom(seed);
        for (i = shots.length - 1; i > 0; i--) {
            var j = Math.floor(rand() * (i + 1));
            var tmp = shots[i]; shots[i] = shots[j]; shots[j] = tmp;
        }
    }

    // Cut points: the start, then every marker after it, snapped to frames
    var bounds = [startFrame];
    var markerFrames = [];
    for (i = 0; i < markers.length; i++) markerFrames.push(Math.round(markers[i].timeInSeconds / fd));
    markerFrames.sort(function (a, b) { return a - b; });
    for (i = 0; i < markerFrames.length; i++) {
        if (markerFrames[i] > bounds[bounds.length - 1]) bounds.push(markerFrames[i]);
    }
    if (bounds.length < 2) throw new Error("No markers after the start time (" + (startFrame * fd) + "s) on the " + markerSource + ".");

    // Without extendIntoSource a shot never runs past its own out-point, so frames from the
    // next shot in the source can't creep in; a shot too short for the next marker ends on the
    // furthest marker it can reach, or at its own end if it reaches none.
    var extend = args.extendIntoSource === true;
    var placed = [];
    var problems = [];
    var cursorFrame = bounds[0];
    var markersUsed = 0;
    for (i = 0; i < shots.length; i++) {
        var L = shots[i];
        var srcIn = L.inPoint - L.startTime;
        var ownFrames = Math.round((L.outPoint - L.inPoint) / fd);
        var endFrame = null;
        var onMarker = false;
        var b;
        if (extend) {
            for (b = 0; b < bounds.length; b++) {
                if (bounds[b] > cursorFrame) { endFrame = bounds[b]; onMarker = true; break; }
            }
        } else {
            for (b = 0; b < bounds.length; b++) {
                if (bounds[b] > cursorFrame && bounds[b] <= cursorFrame + ownFrames) { endFrame = bounds[b]; onMarker = true; }
            }
        }
        if (endFrame === null) endFrame = cursorFrame + ownFrames;
        L.startTime = cursorFrame * fd - srcIn;
        var outT = endFrame * fd;
        var srcEnd = (L.source && L.source.duration) ? L.startTime + L.source.duration : outT;
        if (outT > srcEnd + fd / 2) {
            problems.push(L.name + " runs out of source " + ((outT - srcEnd)).toFixed(2) + "s before its marker");
            outT = srcEnd;
            onMarker = false;
        }
        setLayerSpan(L, cursorFrame * fd, outT);
        if (onMarker) markersUsed++;
        else if (endFrame < bounds[bounds.length - 1]) problems.push(L.name + " is too short to reach a marker and ends off the beat at " + (outT).toFixed(2) + "s");
        placed.push({ name: L.name, inPoint: L.inPoint, outPoint: L.outPoint, lengthFrames: Math.round((L.outPoint - L.inPoint) / fd), onMarker: onMarker });
        cursorFrame = Math.round(L.outPoint / fd);
    }

    // Stack the shots in their new play order so the timeline reads top to bottom
    for (i = 0; i < shots.length; i++) {
        if (shots[i].index !== topIndex + i) shots[i].moveBefore(comp.layer(topIndex + i));
    }
    for (i = 0; i < shots.length; i++) placed[i].layerIndex = shots[i].index;

    return JSON.stringify({
        status: "success",
        composition: { name: comp.name, compIndex: resolved.compIndex },
        markerSource: markerSource,
        markersUsed: markersUsed,
        markersTotal: bounds.length - 1,
        seed: seed,
        order: placed,
        problems: problems,
        disabledLeftInPlace: skipped
    }, null, 2);
}

// Places each clip exactly: which source frame it starts on and which comp frames it spans.
// A clip with duplicate:true gets a copy of its layer, so one shot layer can feed several clips.
// Clips are restacked top to bottom in the order given.
function arrangeClips(args) {
    var resolved = resolveCompItem(args);
    var comp = resolved.comp;
    var fd = comp.frameDuration;
    var clips = args.clips || [];
    if (!clips.length) throw new Error("Pass clips: [{layerName|layerIndex, sourceInFrame, compInFrame, compOutFrame, name?, duplicate?}].");
    var i;

    var layers = [];
    for (i = 0; i < clips.length; i++) {
        layers.push(resolveLayerInComp(comp, { layerIndex: clips[i].layerIndex, layerName: clips[i].layerName }));
    }
    var topIndex = layers[0].index;
    for (i = 1; i < layers.length; i++) topIndex = Math.min(topIndex, layers[i].index);
    for (i = 0; i < clips.length; i++) {
        if (clips[i].duplicate) layers[i] = layers[i].duplicate();
    }

    var placed = [];
    for (i = 0; i < clips.length; i++) {
        var c = clips[i];
        var L = layers[i];
        var srcIn = (c.sourceInFrame !== undefined) ? c.sourceInFrame * fd : L.inPoint - L.startTime;
        var inT = c.compInFrame * fd;
        var outT = c.compOutFrame * fd;
        if (outT <= inT) throw new Error("Clip " + (i + 1) + " ends before it starts.");
        L.startTime = inT - srcIn;
        if (L.source && L.source.duration && outT > L.startTime + L.source.duration + fd / 2) {
            throw new Error("Clip " + (i + 1) + " (" + L.name + ") runs past the end of its source.");
        }
        setLayerSpan(L, inT, outT);
        if (c.name) L.name = c.name;
        if (c.enabled !== undefined) L.enabled = c.enabled;
        placed.push({ name: L.name, sourceInFrame: Math.round((L.inPoint - L.startTime) / fd), inFrame: Math.round(L.inPoint / fd), outFrame: Math.round(L.outPoint / fd) });
    }

    for (i = 0; i < layers.length; i++) {
        if (layers[i].index !== topIndex + i) layers[i].moveBefore(comp.layer(topIndex + i));
    }
    for (i = 0; i < layers.length; i++) placed[i].layerIndex = layers[i].index;

    return JSON.stringify({ status: "success", composition: { name: comp.name, compIndex: resolved.compIndex }, clips: placed }, null, 2);
}

function projectFolderPath(item) {
    var parts = [];
    var f = item.parentFolder;
    while (f && f !== app.project.rootFolder) {
        parts.unshift(f.name);
        f = f.parentFolder;
    }
    return parts.join("/");
}

function projectItemType(item) {
    if (item instanceof CompItem) return "comp";
    if (item instanceof FolderItem) return "folder";
    if (item instanceof FootageItem) {
        if (item.mainSource instanceof SolidSource) return "solid";
        if (item.mainSource instanceof PlaceholderSource) return "placeholder";
        return "footage";
    }
    return "other";
}

function compNamesUsing(item) {
    var names = [];
    var used = item.usedIn;
    for (var i = 0; i < used.length; i++) {
        var seen = false;
        for (var j = 0; j < names.length; j++) if (names[j] === used[i].name) seen = true;
        if (!seen) names.push(used[i].name);
    }
    return names;
}

function listProjectItems(args) {
    args = args || {};
    var wanted = args.type && args.type !== "all" ? args.type : null;
    var needle = args.nameContains ? String(args.nameContains).toLowerCase() : null;
    var items = [];
    var activeIndex = null;
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (app.project.activeItem && item.id === app.project.activeItem.id) activeIndex = i;
        var type = projectItemType(item);
        if (wanted && type !== wanted) continue;
        var filePath = (type === "footage" && item.mainSource.file) ? item.mainSource.file.fsName : null;
        if (needle && item.name.toLowerCase().indexOf(needle) < 0 && !(filePath && filePath.toLowerCase().indexOf(needle) >= 0)) continue;

        var o = { index: i, id: item.id, name: item.name, type: type, folder: projectFolderPath(item) };
        if (item instanceof FootageItem || item instanceof CompItem) {
            o.duration = item.duration;
            o.width = item.width;
            o.height = item.height;
            o.frameRate = item.frameRate;
            o.usedIn = compNamesUsing(item);
        }
        if (item instanceof FootageItem && type === "footage") {
            o.filePath = filePath;
            o.missing = item.footageMissing;
            o.hasVideo = item.hasVideo;
            o.hasAudio = item.hasAudio;
            o.isStill = item.mainSource.isStill;
        }
        if (item instanceof CompItem) {
            o.numLayers = item.numLayers;
        }
        if (item instanceof FolderItem) {
            o.numItems = item.numItems;
        }
        items.push(o);
    }
    return JSON.stringify({
        status: "success",
        projectName: app.project.file ? app.project.file.name : "Untitled Project",
        projectPath: app.project.file ? app.project.file.fsName : null,
        activeItemIndex: activeIndex,
        count: items.length,
        items: items
    }, null, 2);
}

function findRootFolder(name) {
    var root = app.project.rootFolder;
    for (var i = 1; i <= root.numItems; i++) {
        var item = root.item(i);
        if (item instanceof FolderItem && item.name === name) return item;
    }
    return app.project.items.addFolder(name);
}

function findFootageByPath(fsName) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof FootageItem && item.mainSource.file && item.mainSource.file.fsName === fsName) return item;
    }
    return null;
}

// Imports files (reusing ones already in the project) and optionally lays trimmed clips into a comp
function importClips(args) {
    var clips = args.clips || [];
    if (!clips.length) throw new Error("Pass clips: [{filePath, sourceIn?, sourceOut?, compTime?, name?}].");
    var folderName = args.folderName === undefined ? "Scenepack" : args.folderName;
    var folder = null;
    var comp = null, compIndex = null, fd = 0;
    if (args.place !== false) {
        var resolved = resolveCompItem(args);
        comp = resolved.comp;
        compIndex = resolved.compIndex;
        fd = comp.frameDuration;
    }
    var snap = function (t) { return fd ? Math.round(t / fd) * fd : t; };
    var cursor = comp ? snap(comp.time) : 0;

    var entries = [];
    var layers = [];
    var i;
    for (i = 0; i < clips.length; i++) {
        var c = clips[i];
        var f = new File(c.filePath);
        if (!f.exists) throw new Error("Clip " + (i + 1) + ": no file at " + c.filePath);
        var item = findFootageByPath(f.fsName);
        var imported = false;
        if (!item) {
            var io = new ImportOptions(f);
            if (!io.canImportAs(ImportAsType.FOOTAGE)) throw new Error("Clip " + (i + 1) + ": After Effects can't import " + f.fsName);
            io.importAs = ImportAsType.FOOTAGE;
            item = app.project.importFile(io);
            imported = true;
            if (folderName) {
                if (!folder) folder = findRootFolder(folderName);
                item.parentFolder = folder;
            }
        }
        var entry = { filePath: f.fsName, itemId: item.id, itemName: item.name, imported: imported, sourceDuration: item.duration };

        if (comp) {
            if (!item.hasVideo) throw new Error("Clip " + (i + 1) + ": " + item.name + " has no video.");
            var srcIn = snap(c.sourceIn || 0);
            var srcOut = c.sourceOut !== undefined ? snap(c.sourceOut) : Math.floor(item.duration / fd + 0.001) * fd;
            if (srcOut > item.duration + fd / 2) throw new Error("Clip " + (i + 1) + ": sourceOut " + c.sourceOut + "s is past the end of " + item.name + " (" + item.duration.toFixed(3) + "s).");
            if (srcOut - srcIn < fd / 2) throw new Error("Clip " + (i + 1) + ": sourceOut must be after sourceIn.");
            var t = c.compTime !== undefined ? snap(c.compTime) : cursor;
            var L = comp.layers.add(item);
            L.startTime = t - srcIn;
            setLayerSpan(L, t, t + (srcOut - srcIn));
            if (c.name) L.name = c.name;
            cursor = L.outPoint;
            layers.push(L);
            entry.name = L.name;
            entry.sourceInFrame = Math.round(srcIn / fd);
            entry.sourceOutFrame = Math.round(srcOut / fd);
            entry.inFrame = Math.round(L.inPoint / fd);
            entry.outFrame = Math.round(L.outPoint / fd);
            entry.inTime = L.inPoint;
            entry.outTime = L.outPoint;
        }
        entries.push(entry);
    }

    var warnings = [];
    for (i = 0; i < layers.length; i++) {
        entries[i].layerIndex = layers[i].index;
        if (layers[i].outPoint > comp.duration + fd / 2) warnings.push(layers[i].name + " runs past the end of the comp (" + comp.duration.toFixed(3) + "s).");
    }

    var out = { status: "success", folder: folderName || null, clips: entries };
    if (comp) out.composition = { name: comp.name, compIndex: compIndex, frameRate: comp.frameRate };
    if (warnings.length) out.warnings = warnings;
    return JSON.stringify(out, null, 2);
}

function renderFrames(args) {
    var compIndex = resolveCompIndex(args);
    var comp = app.project.item(compIndex);
    if (!(comp instanceof CompItem)) {
        return JSON.stringify({ status: "error", message: "Project item " + compIndex + " is not a composition." });
    }

    var frameDuration = comp.frameDuration;
    var lastFrameTime = comp.duration - frameDuration;
    var times = [];
    var i;
    if (args.frames && args.frames.length) {
        for (i = 0; i < args.frames.length; i++) {
            times.push(args.frames[i] * frameDuration);
        }
    } else if (args.times && args.times.length) {
        times = args.times;
    } else if (args.count) {
        var start = args.startTime !== undefined ? args.startTime : 0;
        var end = args.endTime !== undefined ? args.endTime : lastFrameTime;
        for (i = 0; i < args.count; i++) {
            times.push(args.count === 1 ? start : start + (end - start) * i / (args.count - 1));
        }
    } else {
        times.push(comp.time);
    }

    var folder = new Folder(Folder.myDocuments.fsName + "/ae-mcp-bridge/frames");
    if (!folder.exists) {
        folder.create();
    }

    // Optionally show only one layer, e.g. so effects on layers above don't hide where a cut really is
    var hidden = [];
    var isolated = null;
    if (args.isolateLayerIndex) {
        app.beginUndoGroup("MCP: render isolated layer");
        isolated = comp.layer(args.isolateLayerIndex);
        for (i = 1; i <= comp.numLayers; i++) {
            var other = comp.layer(i);
            if (other !== isolated && other.enabled && !other.locked) {
                other.enabled = false;
                hidden.push(other);
            }
        }
        var wasEnabled = isolated.enabled;
        isolated.enabled = true;
    }

    // saveFrameToPng renders at the comp's resolution factor, read when each call is made
    var oldResolution = comp.resolutionFactor;
    if (args.maxSize) {
        var factor = Math.max(1, Math.floor(Math.max(comp.width, comp.height) / args.maxSize));
        comp.resolutionFactor = [factor, factor];
    }

    var frames = [];
    for (i = 0; i < times.length; i++) {
        var frameNumber = Math.round(Math.max(0, Math.min(times[i], lastFrameTime)) / frameDuration);
        var t = frameNumber * frameDuration;
        var file = new File(folder.fsName + "/" + (args.outputPrefix || "frame") + "_" + i + ".png");
        if (file.exists) {
            file.remove();
        }
        comp.saveFrameToPng(t, file);

        var activeLayers = [];
        for (var j = 1; j <= comp.numLayers; j++) {
            var layer = comp.layer(j);
            if (layer.enabled && layer.hasVideo && layer.activeAtTime(t)) {
                activeLayers.push(layer.index + ": " + layer.name);
            }
        }

        var timecode = "";
        try {
            timecode = timeToCurrentFormat(t + comp.displayStartTime, comp.frameRate);
        } catch (e) {}

        frames.push({
            time: t,
            frame: frameNumber,
            timecode: timecode,
            activeLayers: activeLayers,
            path: file.fsName
        });
    }
    comp.resolutionFactor = oldResolution;
    if (isolated) {
        for (i = 0; i < hidden.length; i++) {
            hidden[i].enabled = true;
        }
        isolated.enabled = wasEnabled;
        app.endUndoGroup();
    }

    return JSON.stringify({
        status: "success",
        composition: {
            name: comp.name,
            compIndex: compIndex,
            width: comp.width,
            height: comp.height,
            frameRate: comp.frameRate,
            duration: comp.duration
        },
        frames: frames
    }, null, 2);
}

// Turns a script's return value into something JSON can hold. AE objects
// (comps, layers, properties) become a short description instead of a cycle.
function toPlainValue(value, depth) {
    if (value === null || value === undefined) return null;
    var t = typeof value;
    if (t === "number") return isFinite(value) ? value : String(value);
    if (t === "string" || t === "boolean") return value;
    if (t === "function") return "[function]";
    if (depth >= 6) return String(value);
    if (value instanceof Array) {
        var list = [];
        var max = Math.min(value.length, 1000);
        for (var i = 0; i < max; i++) list.push(toPlainValue(value[i], depth + 1));
        if (value.length > max) list.push("... " + (value.length - max) + " more");
        return list;
    }
    if (value.constructor === Object) {
        var out = {};
        for (var k in value) {
            if (value.hasOwnProperty(k)) out[k] = toPlainValue(value[k], depth + 1);
        }
        return out;
    }
    var described = { _type: (value.reflect && value.reflect.name) || String(value) };
    try { if (value.name !== undefined) described.name = String(value.name); } catch (e) {}
    try { if (value.index !== undefined) described.index = value.index; } catch (e) {}
    return described;
}

// Runs ExtendScript written by Claude. The code is a function body, so it can
// `return` a value, and log(...) lines come back with the result.
function executeJsx(args) {
    var code = args && args.code;
    if (typeof code !== "string" || !code.replace(/\s/g, "")) {
        return JSON.stringify({ status: "error", message: "No code given." });
    }
    var logs = [];
    var log = function () {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
            var v = arguments[i];
            parts.push(typeof v === "string" ? v : JSON.stringify(toPlainValue(v, 0)));
        }
        logs.push(parts.join(" "));
    };
    var fn;
    try {
        // Wrapper stays on the first line so error line numbers match the code
        fn = eval("(function (log) {" + code + "\n})");
    } catch (syntaxError) {
        return JSON.stringify({ status: "error", phase: "parse", message: syntaxError.toString(), line: syntaxError.line });
    }
    var value;
    try {
        value = fn(log);
    } catch (e) {
        return JSON.stringify({
            status: "error",
            phase: "run",
            message: e.toString(),
            line: e.line,
            logs: logs,
            note: "Changes made before the error are kept; they are part of this command's single undo step."
        });
    }
    return JSON.stringify({ status: "success", result: toPlainValue(value, 0), logs: logs });
}

function runCommandToString(command, args, commandId) {
    var result = "";
    var undoGroupOpen = false;
    
    logToPanel("Executing command: " + command);
    statusText.text = "Running: " + command;
    panel.update();
    
    try {
        if (!READ_ONLY_COMMANDS[command]) {
            var undoName = (command === "executeJsx" && args && args.undoName) ? "Claude: " + args.undoName : "MCP: " + command;
            app.beginUndoGroup(undoName);
            undoGroupOpen = true;
        }
        logToPanel("Attempting to execute: " + command); // Log before switch
        switch (command) {
            case "getProjectInfo":
                result = getProjectInfo();
                break;
            case "listCompositions":
                result = listCompositions();
                break;
            case "getLayerInfo":
                result = getLayerInfo(args);
                break;
            case "renderFrames":
                result = renderFrames(args);
                break;
            case "listProjectItems":
                result = listProjectItems(args);
                break;
            case "importClips":
                result = importClips(args);
                break;
            case "getLayerSourceInfo":
                result = getLayerSourceInfo(args);
                break;
            case "splitLayer":
                result = splitLayer(args);
                break;
            case "updateLayers":
                result = updateLayers(args);
                break;
            case "closeGaps":
                result = closeGaps(args);
                break;
            case "getMarkers":
                result = getMarkers(args);
                break;
            case "cutToMarkers":
                result = cutToMarkers(args);
                break;
            case "arrangeClips":
                result = arrangeClips(args);
                break;
            case "createComposition":
                logToPanel("Calling createComposition function...");
                result = createComposition(args);
                logToPanel("Returned from createComposition.");
                break;
            case "createTextLayer":
                logToPanel("Calling createTextLayer function...");
                result = createTextLayer(args);
                logToPanel("Returned from createTextLayer.");
                break;
            case "createShapeLayer":
                logToPanel("Calling createShapeLayer function...");
                result = createShapeLayer(args);
                logToPanel("Returned from createShapeLayer. Result type: " + typeof result);
                break;
            case "createSolidLayer":
                logToPanel("Calling createSolidLayer function...");
                result = createSolidLayer(args);
                logToPanel("Returned from createSolidLayer.");
                break;
            case "setLayerProperties":
                logToPanel("Calling setLayerProperties function...");
                result = setLayerProperties(args);
                logToPanel("Returned from setLayerProperties.");
                break;
            case "setLayerKeyframe":
                logToPanel("Calling setLayerKeyframe function...");
                result = setLayerKeyframe(resolveCompIndex(args), args.layerIndex, args.propertyName, args.timeInSeconds, args.value);
                logToPanel("Returned from setLayerKeyframe.");
                break;
            case "setLayerExpression":
                logToPanel("Calling setLayerExpression function...");
                result = setLayerExpression(resolveCompIndex(args), args.layerIndex, args.propertyName, args.expressionString);
                logToPanel("Returned from setLayerExpression.");
                break;
            case "applyEffect":
                logToPanel("Calling applyEffect function...");
                result = applyEffect(args);
                logToPanel("Returned from applyEffect.");
                break;
            case "applyEffectTemplate":
                logToPanel("Calling applyEffectTemplate function...");
                result = applyEffectTemplate(args);
                logToPanel("Returned from applyEffectTemplate.");
                break;
            case "listLayerEffects":
                logToPanel("Calling listLayerEffects function...");
                result = listLayerEffects(args);
                logToPanel("Returned from listLayerEffects.");
                break;
            case "listAvailableEffects":
                logToPanel("Calling listAvailableEffects function...");
                result = listAvailableEffects(args);
                logToPanel("Returned from listAvailableEffects.");
                break;
            case "setEffectProperty":
                logToPanel("Calling setEffectProperty function...");
                result = setEffectProperty(args);
                logToPanel("Returned from setEffectProperty.");
                break;
            case "setEffectKeyframe":
                logToPanel("Calling setEffectKeyframe function...");
                result = setEffectKeyframe(args);
                logToPanel("Returned from setEffectKeyframe.");
                break;
            case "applyLayerPreset":
                logToPanel("Calling applyLayerPreset function...");
                result = applyLayerPreset(args);
                logToPanel("Returned from applyLayerPreset.");
                break;
            case "createAdjustmentLayer":
                logToPanel("Calling createAdjustmentLayer function...");
                result = createAdjustmentLayer(args);
                logToPanel("Returned from createAdjustmentLayer.");
                break;
            case "centerLayers":
                logToPanel("Calling centerLayers function...");
                result = centerLayers(args);
                logToPanel("Returned from centerLayers.");
                break;
            case "getLayerClipFrames":
                logToPanel("Calling getLayerClipFrames function...");
                result = getLayerClipFrames(args);
                logToPanel("Returned from getLayerClipFrames.");
                break;
            case "getLayerAudioInfo":
                logToPanel("Calling getLayerAudioInfo function...");
                result = getLayerAudioInfo(args);
                logToPanel("Returned from getLayerAudioInfo.");
                break;
            case "addMarkersFromArray":
                logToPanel("Calling addMarkersFromArray function...");
                result = addMarkersFromArray(args);
                logToPanel("Returned from addMarkersFromArray.");
                break;
            case "addMarker":
                logToPanel("Calling addMarker function...");
                result = addMarker(args);
                logToPanel("Returned from addMarker.");
                break;
            case "setLayerAudioLevels":
                logToPanel("Calling setLayerAudioLevels function...");
                result = setLayerAudioLevels(args);
                logToPanel("Returned from setLayerAudioLevels.");
                break;
            case "removeLayerEffect":
                logToPanel("Calling removeLayerEffect function...");
                result = removeLayerEffect(args);
                logToPanel("Returned from removeLayerEffect.");
                break;
            case "executeJsx":
                result = executeJsx(args);
                break;
            case "bridgeTestEffects":
                logToPanel("Calling bridgeTestEffects function...");
                result = bridgeTestEffects(args);
                logToPanel("Returned from bridgeTestEffects.");
                break;
            default:
                result = JSON.stringify({ error: "Unknown command: " + command });
        }
        if (undoGroupOpen) {
            app.endUndoGroup();
            undoGroupOpen = false;
        }
        logToPanel("Execution finished for: " + command);
        var resultString = (typeof result === 'string') ? result : JSON.stringify(result);
        try {
            var resultObj = JSON.parse(resultString);
            resultObj._responseTimestamp = isoNow();
            resultObj._commandExecuted = command;
            resultObj._commandId = commandId;
            resultString = JSON.stringify(resultObj, null, 2);
        } catch (parseError) {
            logToPanel("Could not parse result as JSON to add timestamp: " + parseError.toString());
        }
        logToPanel("Command completed successfully: " + command);
        statusText.text = "Command completed: " + command;
        return resultString;
    } catch (error) {
        var errorMsg = "ERROR in executeCommand for '" + command + "': " + error.toString() + (error.line ? " (line: " + error.line + ")" : "");
        logToPanel(errorMsg);
        statusText.text = "Error: " + error.toString();
        if (undoGroupOpen) {
            try { app.endUndoGroup(); } catch (undoError) {}
        }
        return JSON.stringify({
            status: "error",
            command: command,
            message: error.toString(),
            line: error.line,
            fileName: error.fileName,
            _responseTimestamp: isoNow(),
            _commandExecuted: command,
            _commandId: commandId
        });
    }
}


function writeResultFile(resultString) {
    var resultFile = new File(getResultFilePath());
    resultFile.encoding = "UTF-8";
    if (!resultFile.open("w")) {
        throw new Error("Failed to open result file for writing: " + resultFile.fsName);
    }
    resultFile.write(resultString);
    resultFile.close();
}


function isErrorResultString(resultString) {
    try {
        return JSON.parse(resultString).status === "error";
    } catch (e) {
        return false;
    }
}


// File-bridge path: run, write the result file, mark the command done
function executeCommand(command, args, commandId) {
    var resultString = runCommandToString(command, args, commandId);
    try {
        writeResultFile(resultString);
    } catch (writeError) {
        logToPanel("CRITICAL ERROR: " + writeError.toString());
    }
    updateCommandStatus(isErrorResultString(resultString) ? "error" : "completed", commandId);
}


// HTTP-bridge path: called by the CEP panel via evalScript, returns the result directly.
// The result file is still written so get-results keeps working.
function mcpHttpExecute(command, argsJson, commandId) {
    var args;
    try {
        args = argsJson ? JSON.parse(argsJson) : {};
    } catch (parseError) {
        return JSON.stringify({ status: "error", message: "Could not parse arguments: " + parseError.toString(), _commandExecuted: command, _commandId: commandId });
    }
    var resultString = runCommandToString(command, args, commandId);
    try {
        writeResultFile(resultString);
    } catch (writeError) {}
    return resultString;
}


function updateCommandStatus(status, commandId) {
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = JSON.parse(content);
                // A newer command may have been written while this one ran
                if (commandId && commandData.id !== commandId) {
                    return;
                }
                commandData.status = status;
                
                commandFile.open("w");
                commandFile.write(JSON.stringify(commandData, null, 2));
                commandFile.close();
            }
        }
    } catch (e) {
        logToPanel("Error updating command status: " + e.toString());
    }
}


function logToPanel(message) {
    if (!(panel instanceof Window)) return;
    var timestamp = new Date().toLocaleTimeString();
    logText.text = timestamp + ": " + message + "\n" + logText.text;
}


function checkForCommands() {
    if (!autoRunCheckbox.value || isChecking) return;
    
    isChecking = true;
    
    try {
        var commandFile = new File(getCommandFilePath());
        if (commandFile.exists) {
            commandFile.open("r");
            var content = commandFile.read();
            commandFile.close();
            
            if (content) {
                var commandData = (typeof JSON !== "undefined" && JSON.parse)
                    ? JSON.parse(content)
                    : eval("(" + content + ")");
                
                
                if (commandData.status === "pending") {
                    
                    updateCommandStatus("running", commandData.id);
                    
                    
                    executeCommand(commandData.command, commandData.args || {}, commandData.id);
                }
            }
        }
    } catch (e) {
        logToPanel("Error checking for commands: " + e.toString());
    }
    
    isChecking = false;
}


function startCommandChecker() {
    app.scheduleTask("checkForCommands()", checkInterval, true);
}


if (!MCP_HEADLESS) {
    var checkButton = panel.add("button", undefined, "Check for Commands Now");
    checkButton.onClick = function() {
        logToPanel("Manually checking for commands");
        checkForCommands();
    };


    logToPanel("MCP Bridge Auto started");
    logToPanel("Command file: " + getCommandFilePath());
    statusText.text = "Ready - Auto-run is " + (autoRunCheckbox.value ? "ON" : "OFF");


    startCommandChecker();


    panel.center();
    panel.show();
}
// Reset so opening the palette later from the Window menu still shows it
MCP_HEADLESS = false;
