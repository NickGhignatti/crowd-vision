## 📊 The Dashboard

The **Dashboard** is your command center for real-time analytics. It provides a tabular view of all rooms within a selected building.

### Interface Overview
* **Time & Date**: Displayed prominently at the top for quick reference.
* **Model Selection**: Use the dropdown menu to switch between different buildings (e.g., "Main Campus", "Science Block").

### Room Statistics Table
The data table provides live metrics for every room. Here is what each column represents:

| Column | Description |
| :--- | :--- |
| **Room** | The unique identifier or number of the room. |
| **Status** | A calculated text indicator of occupancy (see logic below). |
| **Teacher** | The name of the staff member currently scheduled (if applicable). |
| **Temp** | Current room temperature. |
| **People** | Real-time count of occupants detected by sensors. |
| **Capacity** | The maximum allowed number of people for the room. |

### Occupancy Status Logic
CrowdVision automatically calculates the status of a room based on the percentage of capacity filled:

| Status | Color Indicator | Condition |
| :--- | :--- | :--- |
| **Empty** | <span style="color: #059669; font-weight: bold;">Emerald</span> | 0% Occupancy |
| **Normal** | <span style="color: #2563eb;">Blue</span> | 1% – 50% Occupancy |
| **Crowded** | <span style="color: #ea580c;">Orange</span> | 51% – 95% Occupancy |
| **Full** | <span style="color: #dc2626; font-weight: bold;">Red</span> | 96% – 100% Occupancy |
| **Overcrowded** | <span style="color: #dc2626; font-weight: bold;">Red</span> | > 100% Occupancy |

!!! tip "Focus Mode"
Click the **Focus Mode** button (top-left of the dashboard) to enter fullscreen. This is ideal for display screens in lobbies or control rooms. The text scales up automatically for better readability from a distance.
