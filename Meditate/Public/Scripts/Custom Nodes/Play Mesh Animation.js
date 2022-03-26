// @input Component.AnimationMixer animationMixer
// @input string layerName
// @input bool loop
// @input bool stopOtherLayers
// @output execution onComplete

var layer = script.animationMixer.getLayer(script.layerName);
if (layer) {
    layer.weight = 1.0;
} else {
    return;
}

if (script.stopOtherLayers) {
    var layers = script.animationMixer.getLayers();
    for (var i = 0; i < layers.length; i++) {
        if (layers[i].name !== script.layerName) {
            layers[i].stop();
            layers[i].weight = 0;
        }
    }
}

var cycles = script.loop ? -1 : 1;

if (script.onComplete) {
    layer.startWithCallback(0, cycles,  script.onComplete);
} else {
    layer.start(0, cycles);
}
