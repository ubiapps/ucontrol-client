ucontrol-client
===============

Client-side uControl app. 

---
Consists of 3 components

boot
====
- Executes when the system boots. 
- Checks for updates.
- Installs updates if necessary.
- Starts monitor component.
- Starts configuration component.

monitor
=======
- Opens transceiver port and subscribes to events.
- Logs all events to file.
- Transmits temperature change events to server.

configuration
=============
- Provides a web interface for configuration of the monitor component.
