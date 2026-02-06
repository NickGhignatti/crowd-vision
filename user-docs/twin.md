## 🏢 3D Digital Twin View

The **Model View** offers an interactive 3D representation of your building. This allows you to visually locate rooms, check their layout, and manage their properties.

### Navigating the 3D Scene
* **Rotate**: Click and drag your mouse to rotate the building.
* **Zoom**: Scroll up/down or use the control panel buttons.
* **Select Room**: Click on any room block to select it. The selected room will turn **Green** (`#10b981`) and become semi-transparent.

### The Control Panel
Located at the bottom center of the screen, the control panel provides quick actions:

* <i class="ph-bold ph-cube"></i> **Reset View**: Returns the camera to the default starting position.
* <i class="ph-bold ph-arrows-out"></i> **Focus on Room (Explode)**: Isolates the selected room by expanding the view, allowing you to see it clearly apart from the rest of the building structure.
* <i class="ph-bold ph-plus"></i> **Zoom In**: Moves the camera closer.
* <i class="ph-bold ph-minus"></i> **Zoom Out**: Moves the camera further away.
* <i class="ph-bold ph-camera"></i> **Panorama Mode**: Toggles an automatic rotation of the building for showcase purposes.

### Managing Buildings & Floors (Left Menu)
The sidebar on the left allows you to:
1.  **Select Building**: Choose which building structure to visualize.
2.  **Filter by Floor**: Click on a specific floor number to hide other floors and focus only on that level.
3.  **Upload Model**: You can upload a JSON file containing a new building configuration.

### Room Details & Editing (Right Menu)
When a room is selected, a panel on the right appears with specific details.

**Editing a Room**:
If you have the necessary permissions, you can edit room parameters:
1.  Select a room in the 3D view.
2.  Click the **Edit** button in the right panel.
3.  Modify the following fields:
    * **Room ID**: The unique name/number.
    * **Capacity**: Max number of people.
    * **Max Temperature**: The threshold for temperature alerts (default is 28°C).
    * **Theme Color**: The color used to represent the room in charts or headers.
4.  Click **Save**.
