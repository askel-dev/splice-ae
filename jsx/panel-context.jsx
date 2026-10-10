// Snapshot of what the user is looking at, sent along with each chat message
function claudePanelContext() {
    function round(n) {
        return Math.round(n * 1000) / 1000;
    }
    function q(s) {
        return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]/g, " ") + '"';
    }
    function layerType(layer) {
        if (layer instanceof TextLayer) return "text";
        if (layer instanceof ShapeLayer) return "shape";
        if (layer instanceof CameraLayer) return "camera";
        if (layer instanceof LightLayer) return "light";
        if (layer.adjustmentLayer) return "adjustment";
        if (layer.nullLayer) return "null";
        if (layer.source instanceof CompItem) return "precomp";
        if (layer.source && layer.source.mainSource instanceof SolidSource) return "solid";
        if (layer.hasVideo === false && layer.hasAudio) return "audio";
        return "footage";
    }

    var lines = [];
    var project = app.project;
    lines.push("project: " + (project.file ? project.file.fsName : "(unsaved)"));

    var item = project.activeItem;
    if (!(item instanceof CompItem)) {
        lines.push("active item: " + (item ? item.name + " (not a comp)" : "none"));
        var sel = project.selection;
        if (sel && sel.length) {
            var names = [];
            for (var s = 0; s < sel.length && s < 20; s++) names.push(q(sel[s].name));
            lines.push("selected project items: " + names.join(", "));
        }
        return lines.join("\n");
    }

    var comp = item;
    var fps = comp.frameRate;
    lines.push("active comp: " + q(comp.name) + " " + comp.width + "x" + comp.height + " @ " + round(fps) + "fps, duration " +
        round(comp.duration) + "s, " + comp.numLayers + " layers");
    lines.push("playhead: " + round(comp.time) + "s (frame " + Math.round(comp.time * fps) + ")");
    lines.push("work area: " + round(comp.workAreaStart) + "s to " + round(comp.workAreaStart + comp.workAreaDuration) + "s");

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
        lines.push("selected layers: none");
    } else {
        lines.push("selected layers:");
        for (var i = 0; i < layers.length && i < 30; i++) {
            var l = layers[i];
            var effects = [];
            var fx = l.property("ADBE Effect Parade");
            if (fx) {
                for (var e = 1; e <= fx.numProperties && e <= 8; e++) effects.push(fx.property(e).name);
            }
            lines.push("  #" + l.index + " " + q(l.name) + " [" + layerType(l) + "] in " + round(l.inPoint) + "s out " +
                round(l.outPoint) + "s" + (effects.length ? ", effects: " + effects.join(", ") : ""));
        }
        if (layers.length > 30) lines.push("  ...and " + (layers.length - 30) + " more");
    }

    var props = comp.selectedProperties;
    var propNames = [];
    for (var p = 0; p < props.length && propNames.length < 15; p++) {
        if (props[p].propertyType === PropertyType.PROPERTY) {
            var owner = props[p].propertyGroup(props[p].propertyDepth);
            propNames.push((owner ? owner.name + " > " : "") + props[p].name);
        }
    }
    if (propNames.length) lines.push("selected properties: " + propNames.join("; "));

    return lines.join("\n");
}
