"""COLMAP visualizer

Visualize COLMAP sparse reconstruction outputs. To get demo data, see `./assets/download_colmap_garden.sh`.
"""

import time
from pathlib import Path
from typing import Optional

import imageio.v3 as iio
import numpy as onp
import tyro
from tqdm.auto import tqdm

import viser
import viser.transforms as tf
from viser.extras.colmap import (
    read_cameras_binary,
    read_images_binary,
    read_points3d_binary,
)


def main(
    colmap_path: Path = Path(__file__).parent / "assets/colmap_garden/sparse/0",
    images_path: Path = Path(__file__).parent / "assets/colmap_garden/images_8",
    downsample_factor: int = 2,
    max_points: Optional[int] = 100000,
    max_frames: Optional[int] = 100,
    point_size: float = 0.01,
) -> None:
    """Visualize COLMAP sparse reconstruction outputs.

    Args:
        colmap_path: Path to the COLMAP reconstruction directory.
        downsample_factor: Downsample factor for the images.
        max_points: Maximum number of points to visualize.
        max_frames: Maximum number of frames to visualize.
        point_size: Size of the points.
    """
    server = viser.ViserServer()

    # Load the colmap info.
    cameras = read_cameras_binary(colmap_path / "cameras.bin")
    images = read_images_binary(colmap_path / "images.bin")
    points3d = read_points3d_binary(colmap_path / "points3D.bin")

    # Set a world rotation to make the scene upright.
    server.add_frame(
        "/colmap",
        wxyz=tf.SO3.exp(onp.array([-onp.pi / 2.0, 0.0, 0.0])).wxyz,
        position=(0, 0, 0),
        show_axes=False,
    )

    # Set the point cloud.
    points = onp.array([points3d[p_id].xyz for p_id in points3d])
    colors = onp.array([points3d[p_id].rgb for p_id in points3d])
    if max_points is not None:
        onp.random.shuffle(points)
        onp.random.shuffle(colors)
        points = points[:max_points]
        colors = colors[:max_points]
    server.add_point_cloud(
        name="/colmap/pcd", points=points, colors=colors, point_size=point_size
    )

    # Interpret the images and cameras.
    img_ids = [im.id for im in images.values()]
    if max_frames is not None:
        onp.random.shuffle(img_ids)
        img_ids = sorted(img_ids[:max_frames])

    for img_id in tqdm(img_ids):
        img = images[img_id]
        cam = cameras[img.camera_id]

        # Skip images that don't exist.
        image_filename = images_path / img.name
        if not image_filename.exists():
            continue

        T_world_camera = tf.SE3.from_rotation_and_translation(
            tf.SO3(img.qvec), img.tvec
        ).inverse()
        server.add_frame(f"/colmap/frames/t{img_id}", show_axes=False)
        server.add_frame(
            f"/colmap/frames/t{img_id}/camera",
            wxyz=T_world_camera.rotation().wxyz,
            position=T_world_camera.translation(),
            axes_length=0.1,
            axes_radius=0.005,
        )

        # For pinhole cameras, cam.params will be (fx, fy, cx, cy).
        if cam.model != "PINHOLE":
            print(f"Expected pinhole camera, but got {cam.model}")

        H, W = cam.height, cam.width
        fy = cam.params[1]
        image = iio.imread(image_filename)
        image = image[::downsample_factor, ::downsample_factor]
        server.add_camera_frustum(
            f"/colmap/frames/t{img_id}/camera/frustum",
            fov=2 * onp.arctan2(H / 2, fy),
            aspect=W / H,
            scale=0.15,
            image=image,
        )

    while True:
        time.sleep(10.0)


if __name__ == "__main__":
    tyro.cli(main)
