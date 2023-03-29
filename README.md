# viser

`viser` is a library for web-based 3D visualization in Python, inspired by the
best bits of the
[Nerfstudio viewer](https://github.com/nerfstudio-project/nerfstudio),
[Pangolin](https://github.com/stevenlovegrove/Pangolin),
[rviz](https://wiki.ros.org/rviz/), and
[meshcat](https://github.com/rdeits/meshcat).

Core features:

- A websocket interface for easy use on remote machines.
- Visualization primitives: coordinate axes, frustums, point clouds, meshes,
  images.
- Configurable GUI elements: buttons, checkboxes, text inputs, sliders,
  dropdowns.
- A [tf](http://wiki.ros.org/tf)-inspired coordinate frame tree.
- Support for multiple panels and view-synchronized connections; helpful for
  side-by-side comparisons.

---

## Setup

#### Client

```bash
cd viser/client
npm install
npm start
```

#### Server

```bash
cd viser/
pip install -e .
python ./examples/4_gui.py  # Or other example
```

---

![pointcloud_preview](./viser.png)

## TODO

Python-controllable GUI

- [x] Plumbing (new broadcast/client interfaces etc)
- [x] Primitives
  - [x] Select / drop-down
  - [x] Checkbox
  - [x] Slider
  - [x] Basic textbox
  - [x] 2D vector
  - [x] 3D vector
  - [x] Button
- [x] Commands
  - [x] .value(), last_updated()
  - [x] Callback interface
  - [x] Set value from Python
  - [x] Allow disabling
  - [x] Remove GUI element
- [x] Synchronize GUIs across clients (for broadcasted)
- [x] Folders

Scene tree

- [x] useState prototype
- [x] useState -> zustand

- Websocket connection

  - [x] Stateful server
  - [x] Redundant message culling
  - [ ] Multiple "servers"? Conflicting ports?

- Camera controls

  - [x] Orbit controls
  - [ ] Keyboard

- Message types

  - [x] Coordinate frame
  - [x] Point cloud
    - [x] Naive serialization
    - [x] Directly access `.data`
  - [x] Camera frustum
  - [x] Image
  - [x] Video stream (seems fine to just images for this)
  - [x] Background set
  - [x] Camera read
  - [ ] Camera write
  - [x] Ensure message ordering
  - [x] Meshes!!
  - [ ] Lights?
  - [x] Set visibility

- Serialization

  - [x] JSON
  - [x] JSON -> msgpack
  - [x] Automate synchronization of typescript / dataclass definitions

- UI

  - [ ] Icons for scene node type
  - [ ]

- Exporting
  - [x] Background download
  - [ ] Video export
  - [ ] SVG export
