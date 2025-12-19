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

Thus the input simplicity, is not always easy find the correct position and dimension, allowing a great user experience!