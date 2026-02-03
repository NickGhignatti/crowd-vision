# Requirements

### Real time visualization

Real time structure twin, allowing both generic users and admin ones to consult the status of the structure. By simulating 
sensors we can simulate temperature ones and movements ones too, thanks to websocket we can create a quick communication
between the express server and the vue client

### Push server-initiated notifications

Some kind of notifications, like when a certain area temperature raise above the comfort one, or when is overcrowded

### History and data logs

An aggregate view of all data with some statistics (maybe by hours or kinda), with graphs and comparison between different
structures or floors

### LLM integration

**Campus conversational assistant**: users can ask questions in natural language
such as "where can I currently find a less crowded classroom to study?" 
or "when is the best time to go to the canteen?", and the LLM translates
the request into a query on the digital twin and returns an understandable textual answer.

**Automatic report generation** for the admin: starting from crowd statistics, the LLM synthesizes brief reports 
("this week, peak attendance shifted from library A to library B in the evening hours").

**"Intelligent" push notifications**: instead of static messages, the backend calls the LLM to generate different natural
texts depending on the user type and the event ("area X is very crowded, we recommend Y as an alternative").
