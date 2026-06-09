# User Guide figures

Every figure in the user guide currently points to a **placeholder image** in
`figures/`. Each placeholder is a standalone SVG, so it can be replaced one at a
time without touching any other figure.

## How to add a real screenshot

1. Capture the screenshot described by the figure's caption in the guide.
2. Replace the matching file in `figures/` with your image, keeping the **same
   file name**. The simplest path is to overwrite the `.svg`.
3. If you save as PNG/JPG instead of SVG, update that one figure's link in the
   `.qd` page (e.g. `figures/login-dialog.svg` → `figures/login-dialog.png`).
4. Recompile the guide (`just docs`). Quarkdown copies the image into the
   page's `media/` folder automatically.

## Shot list

| File | What to capture |
| --- | --- |
| `app-overview.svg` | The dashboard right after login. |
| `registration-form.svg` | The sign-up form (username, email, password). |
| `otp-registration.svg` | The sign-up form with the OTP field filled in. |
| `login-dialog.svg` | The login dialog. |
| `signin-popup.svg` | The "Sign in to continue" popup over a locked page. |
| `sso-start.svg` | The enterprise SSO sign-in entry point. |
| `dashboard-table.svg` | The dashboard table view with live rooms. |
| `building-selector.svg` | The building selector dropdown, open. |
| `view-toggle.svg` | The List / Graph toggle and Fullscreen control. |
| `table-edit-mode.svg` | A column header in edit mode (grip, ✕, caret, ＋). |
| `add-column-panel.svg` | The add-column panel with metric chips. |
| `swap-menu.svg` | The swap-column dropdown under a header. |
| `graph-view.svg` | The Graph view with occupancy and temperature charts. |
| `simulator-controls.svg` | The simulator button and its settings (gear) modal. |
| `twin-3d.svg` | The 3D digital twin of a building. |
| `twin-control-panel.svg` | The 3D view control panel. |
| `twin-room-details.svg` | The right menu with a room selected. |
| `edit-room.svg` | The Edit Room dialog. |
| `register-building.svg` | The Register Building modal. |
| `domains-view.svg` | The Domains view (control bar + table). |
| `admin-panel-qr.svg` | The Administrator Panel showing a domain's token and QR codes. |
| `notification-bell.svg` | The notification bell with the alert feed open. |
| `push-permission.svg` | The browser permission prompt for notifications. |
