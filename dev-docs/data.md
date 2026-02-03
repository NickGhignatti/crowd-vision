# Data model

How are data modeled in our application? Piece of cake! To upload a building you just need a json file which describe
it!

```json
{
  "id": string,
  "rooms": [
    {
      "id": string,
      "capacity": number,
      "temperature": number,
      "no_person": number,
      "color": string,
      "position": {
        "x": number,
        "y": number,
        "z": number
      },
      "dimensions": {
        "width": number,
        "height": number,
        "depth": number
      }
    }
  ],
  "domains": [
    string
  ]
}
```

### Fields Description

| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `string` | Unique identifier for the building. |
| **domains** | `string[]` | List of administrative domains the building belongs to. |
| **rooms** | `object[]` | List of rooms contained within the building. |

#### Room Object
| Field | Type | Description |
| :--- | :--- | :--- |
| **id** | `string` | Unique identifier for the room. |
| **capacity** | `number` | Maximum number of people allowed. |
| **temperature** | `number` | Current temperature reading. |
| **maxTemperature** | `number` | (Optional) Threshold for temperature alerts. |
| **no_person** | `number` | Current crowd count. |
| **color** | `string` | (Optional) Hex code for visual representation. |
| **position** | `x, y, z` | Coordinates of the room in 3D space. |
| **dimensions** | `w, h, d` | Physical dimensions of the room. |

Thus the input simplicity, is not always easy find the correct position and dimension, allowing a great user experience!