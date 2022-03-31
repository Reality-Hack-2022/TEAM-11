// @input Asset.AudioTrackAsset audioTrack
// @input bool loop = false
// @output execution onFinished
// @output Component.AudioComponent audioComponent

if (!script.audioTrack) {
    return;
}

var audioComponents = script.getSceneObject().getComponents("Component.AudioComponent");
var current = null;

for (var i=0; i<audioComponents.length; i++) {
    var com = audioComponents[i];
    if (com.audioTrack && !com.isPlaying() && !com.isPaused() && com.audioTrack.isSame(script.audioTrack)) {
        current = com;
    }
}

if (!current) {
    current = script.getSceneObject().createComponent("Component.AudioComponent");
    current.audioTrack = script.audioTrack;
}

script.audioComponent = current;

if (script.onFinished) {
    current.setOnFinish(script.onFinished);
} else {
    current.setOnFinish(function() {});
}

current.play(script.loop ? -1 : 1);

