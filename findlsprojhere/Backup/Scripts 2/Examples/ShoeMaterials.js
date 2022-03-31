// ShoeMaterials.js
// Version: 1.0.0
// Event: On Awake
// Description: Cotrols material switching for the shoes

// @input Asset.Material[] material
// @input Component.RenderMeshVisual leftShoe
// @input Component.RenderMeshVisual rightShoe


function setMaterial(index) {
    if (script.material && index < script.material.length && script.material[index]) {
        if (script.leftShoe) {
            script.leftShoe.clearMaterials();
            script.leftShoe.addMaterial(script.material[index]);
        }

        if (script.rightShoe) {
            script.rightShoe.clearMaterials();
            script.rightShoe.addMaterial(script.material[index]);
        }
    }
}


if (global.behaviorSystem) {
    global.behaviorSystem.addCustomTriggerResponse("MATERIAL_1", function() {
        setMaterial(0);
    });
    global.behaviorSystem.addCustomTriggerResponse("MATERIAL_2", function() {
        setMaterial(1);
    });
    global.behaviorSystem.addCustomTriggerResponse("MATERIAL_3", function() {
        setMaterial(2);
    });
}
