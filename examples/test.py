import time
from pathlib import Path

import numpy as np
import trimesh

import viser
import viser.transforms as tf


def main() -> None:
    # Load mesh.
    mesh = trimesh.load_mesh(str(Path(__file__).parent / "dragon.obj"))
    assert isinstance(mesh, trimesh.Trimesh)
    mesh.apply_scale(0.05)
    vertices = mesh.vertices
    faces = mesh.faces
    print(f"Loaded mesh with {vertices.shape} vertices, {faces.shape} faces")
    mesh2 = trimesh.load_mesh(str(Path(__file__).parent / "plane.obj"))
    vertices2 = mesh2.vertices
    faces2 = mesh2.faces
   
    # Start Viser server with mesh.
    server = viser.ViserServer()

    server.scene.add_mesh_trimesh(
        name="/trimeshdragon",
        mesh=mesh,
        wxyz=tf.SO3.from_x_radians(np.pi / 2).wxyz,
        position=(0.0, 0.0, 0.0),
    )
    # server.scene.add_mesh_simple(
    #     name="/simpledragon",
    #     vertices=vertices,
    #     faces=faces,
    #     wxyz=tf.SO3.from_x_radians(np.pi / 2).wxyz,
    #     position=(0.0, 0.0, 0.0),
    # )
    
    server.scene.add_mesh_trimesh(
        name="/trimeshplane",
        mesh=mesh2,
        wxyz=tf.SO3.from_x_radians(np.pi / 2).wxyz,
        position=(0.0, 0.0, -2.0),
    )
    # server.scene.add_mesh_simple(
    #     name="/simpleplane",
    #     vertices=vertices2,
    #     faces=faces2,
    #     wxyz=tf.SO3.from_x_radians(np.pi / 2).wxyz,
    #     position=(0.0, 0.0, 0.0),
    # )
   
    # adding controls to custom lights in the scene
    server.scene.add_transform_controls("/control0", position=(0.0, 10.0, 5.0))
    server.scene.add_label("/control0/label", "Directional")
    server.scene.add_transform_controls("/control1", position=(0.0, -5.0, 5.0))
    server.scene.add_label("/control1/label", "Point")

    directional_light = server.scene.add_light_directional(
        name="/control0/directional_light",
        color=(186, 219, 173),
        castShadow=True
    )
    point_light = server.scene.add_light_point(
        name="/control1/point_light",
        color=(192, 255, 238),
        intensity=30.0,
        castShadow=True
    )

    # Create default light toggle.
    gui_default_lights = server.gui.add_checkbox("Default lights", initial_value=True)
    gui_default_lights.on_update(
        lambda _: server.scene.enable_default_lights(gui_default_lights.value)
    )

    # Create light control inputs.
    with server.gui.add_folder("Directional light"):
        gui_directional_color = server.gui.add_rgb(
            "Color", initial_value=directional_light.color
        )
        gui_directional_intensity = server.gui.add_slider(
            "Intensity",
            min=0.0,
            max=20.0,
            step=0.01,
            initial_value=directional_light.intensity,
        )

        @gui_directional_color.on_update
        def _(_) -> None:
            directional_light.color = gui_directional_color.value

        @gui_directional_intensity.on_update
        def _(_) -> None:
            directional_light.intensity = gui_directional_intensity.value

    # Create GUI elements for controlling environment map.
    with server.gui.add_folder("Environment map"):
        gui_env_preset = server.gui.add_dropdown(
            "Preset",
            (
                "None",
                "apartment",
                "city",
                "dawn",
                "forest",
                "lobby",
                "night",
                "park",
                "studio",
                "sunset",
                "warehouse",
            ),
            initial_value="city",
        )
        gui_background = server.gui.add_checkbox("Background", False)
        gui_bg_blurriness = server.gui.add_slider(
            "Bg Blurriness",
            min=0.0,
            max=1.0,
            step=0.01,
            initial_value=0.0,
        )
        gui_bg_intensity = server.gui.add_slider(
            "Bg Intensity",
            min=0.0,
            max=1.0,
            step=0.01,
            initial_value=1.0,
        )
        gui_env_intensity = server.gui.add_slider(
            "Env Intensity",
            min=0.0,
            max=1.0,
            step=0.01,
            initial_value=0.1,
        )

    def update_environment_map(_) -> None:
        server.scene.set_environment_map(
            gui_env_preset.value if gui_env_preset.value != "None" else None,
            background=gui_background.value,
            background_blurriness=gui_bg_blurriness.value,
            background_intensity=gui_bg_intensity.value,
            environment_intensity=gui_env_intensity.value,
        )

    update_environment_map(None)
    gui_env_preset.on_update(update_environment_map)
    gui_background.on_update(update_environment_map)
    gui_bg_blurriness.on_update(update_environment_map)
    gui_bg_intensity.on_update(update_environment_map)
    gui_env_intensity.on_update(update_environment_map)

    while True:
        time.sleep(10.0)


if __name__ == "__main__":
    main()