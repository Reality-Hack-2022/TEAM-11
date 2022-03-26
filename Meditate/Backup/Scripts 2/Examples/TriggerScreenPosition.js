// TriggerScreenPosition.js
// Version: 1.0.0
// Event: On Awake
// Description: Start aimation for the decorative feet sprites by sending custom behavior triggers

// @input SceneObject footBinding
// @input Component.ScreenTransform target
// @input Component.Camera camera
// @input string[] behaviorTriggers


var transform = null;
var updateEvent = script.createEvent("UpdateEvent");
updateEvent.bind(onUpdate);
updateEvent.enabled = false;

function onUpdate() {
    var pos = transform.getWorldPosition();
    pos = script.camera.worldSpaceToScreenSpace(pos);
    
    if (script.target.containsScreenPoint(pos)) {
        for (var i = 0; i < script.behaviorTriggers.length; i++) {
            var triggerName = script.behaviorTriggers[i];
            global.behaviorSystem.sendCustomTrigger(triggerName);
        } 
    }
}

function init() {
    if (script.footBinding && script.target) {
        transform = script.footBinding.getTransform();
        updateEvent.enabled = true;
    }
}

init();


