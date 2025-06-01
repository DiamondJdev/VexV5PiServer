# 🤖 VEX Remote Code Upload Server (Pi Bridge)

Remotely upload and execute VEX V5 code from anywhere using a **Raspberry Pi 4** as a secure USB bridge to the VEX Brain. This project sets up a headless Pi server that allows authenticated users to upload `.cpp` files, compile them using PROS, and flash them directly to the brain — all over Wi-Fi! 🛰️

## 📦 Materials Needed

| Component        | Recommended Model                        | Notes                                   |
|------------------|------------------------------------------|-----------------------------------------|
| Raspberry Pi     | Pi 4 (2GB RAM or higher)                 | MUST be 64-bit capable                  |
| MicroSD Card     | 32GB+ MicroSD card                       | Size will dictate size of projects stored |
| Power Supply     | Official Pi 4 PSU                        | 5V/3A recommended                        |
| USB-A to USB-C   | USB A to USB C cable                     | For connecting Pi → VEX V5 Brain        |
| Computer         | Any SSH-capable, internet connected computer| Used to SSH into the Pi and send commands |
| Wi-Fi Connection | Stable 2.4GHz or 5GHz                    | Pi will require network access     |

## 📖 Table of Contents

1. [🔧 Setup Overview](#-setup-overview)
2. [🧰 Suggested Use Cases](#-real-world-use-cases)
3. [🚀 Flashing the Pi](#-flashing-the-pi)
4. [🛠️ First Boot & SSH Access](#️-first-boot--ssh-access)
5. [🖧 Installing the Server](#-installing-the-server)
6. [🌐 Secure remote access feat. Tailscale](#-secure-remote-access-with-tailscale)
6. [📡 Using the Server](#-using-the-server)
7. [🐞 Troubleshooting](#-troubleshooting)
8. [📬 Contact](#-contact)
9. [💸 Donate](#-donate)

## 🔧 Setup Overview

This project installs a **FastAPI Python server** on your Pi, which listens for upload requests and flashes VEX code using PROS. It runs on a port of your choosing (see [Chapter 4](#-installing-the-server)) and uses SSH and HTTPS for encrypted communication.
> This guide covers a broad, barebones install made to help beginners setup a Raspberry Pi SSH Server and connect to it using RAS Key-pair authentication. 

## 🧰 Real-World Use-Cases
At 719Rip, this software is used to bridge the gap between builders and programmers (literally). Using Pi Bridge, the robot can stay full-time with the driver or builders, giving them uninterrupted access for testing and tuning. If an issue arises, they can simply call a programmer, who can push an updated version of the code from anywhere, practically as fast as they can write it. This removes the bottlenecks traditionally caused by conflicting schedules and physical handoffs. Every moment with the robot counts, and Pi Bridge ensures that all team members, regardless of availability, can make the most of that time.

## 🚀 Flashing the Pi

1. 🔗 Download the [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
2. Select:
   - **Device**: Raspberry Pi 4
   - **OS**: Raspberry Pi OS Lite (64-bit)
   - **Storage**: MicroSD card, USB drive, or NVMe M.2 (compatibility depends on your Pi model)
   - Click **Next**
3. 📂 In **OS Customization Settings**, click **Edit Settings** and configure:
   - Hostname, username, password
   - Wi-Fi SSID and password  
   > ⚠️ **Important:** This will be your only access method. Forgetting the username or password will require re-flashing the Pi.
4. Under the **Services** tab:
   - Enable **SSH**
   - Choose **Public-key authentication** (recommended) or **password authentication**
   > 🔐 **Note:** Public-key authentication is more secure and will be used throughout this guide. Password login is easier for beginners.
5. Click **Run SSH-Keygen** if using keys, then finish imaging.
6. Eject the storage and insert it into the Raspberry Pi.  
   > ⚠️ **Do not power on the Pi before inserting the storage device.**



## 🛠️ First Boot & SSH Access

1. Boot the Pi and wait for it to initialize (headless OS means **no GUI**, only terminal).
2. Determine the Pi’s IP address (via router, `ping raspberrypi.local`, etc.)
> [!NOTE]
> if the Pi's address looks like `127.0.0.1` the pi is NOT connected to WiFI. Run `sudo raspi-config` and press the `enter` key twice. Then enter the WiFi's SSID and Password. You should now be connected to the WiFi network, run `logout` to return to the login screen and view the IP address at the top of the page. 
3. From your main machine:

### 🔑 If using password-based SSH:
```bash
ssh <username>@<Pi-IP>
```

- Accept the fingerprint
- Enter your password

### 🔐 If using public-key authentication:
On your Raspberry Pi:
```bash
eval "$(ssh-agent -s)" 
ssh-add ~/.ssh/id_rsa
```
On your main computer:
```bash
ssh-keygen -t rsa    # or ed25519
ssh-copy-id <username>@<Pi-IP>
```

> If `ssh-copy-id` is unavailable:
```bash
scp ~/.ssh/id_rsa.pub <username>@<Pi-IP>:~/.ssh/authorized_keys
```

Once copied:
```bash
ssh <username>@<Pi-IP>
```

✅ You’re now connected to the Pi on your local network. Time to set up the server!

## 🖧 Installing the Server

1. Update and install required packages:
```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install python3-venv python3-pip gcc-arm-none-eabi libusb-1.0-0-dev git curl -y
```

2. Set up project folder:
```bash
mkdir ~/server && cd ~/server
python3 -m venv .venv
source .venv/bin/activate
pip install "fastapi[all]" "uvicorn[standard]" pros-cli
```

3. Clone this repository:
```bash
git clone https://github.com/DiamondJdev/VexV5PiServer .
```

4. Create and secure SSL certificates:
```bash
mkdir ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/server.key -out ssl/server.crt
chmod 600 ssl/server.key
chmod 644 ssl/server.crt
```

5. Create the systemd service:
```bash
sudo nano /etc/systemd/system/vex-server.service
```

Paste this template:
```ini
[Unit]
Description=Pi Bridge Server
After=network.target

[Service]
User=<serverUser>
WorkingDirectory=/home/<username>/server
ExecStart=/home/<username>/server/.venv/bin/uvicorn main:app \
    --host 0.0.0.0 --port 443 \
    --ssl-keyfile=/home/<username>/server/ssl/server.key \
    --ssl-certfile=/home/<username>/server/ssl/server.crt
Restart=always

[Install]
WantedBy=multi-user.target
```
> [!TIP]
> You will need to replace `<serverUser>` occurrences in `compiler_upload.sh`, `main.py` and `vex-server.service` with the user you are going to run the server on. Failure to set the right user, or misspelling the user will result in various errors from the systemd service.

> [!CAUTION]
> Running the server on an account with `Super User Do` permissions (otherwise refered to as `sudo`) will open your Raspberry Pi, all connected devices, and the WiFi network powering it to a large security vulnerablity that could result in a malicous actor gaining access to any and all network traffic, allowing said actor to intercept bank information, emails, usernames and passwords, etc. To prevent against this: **DO NOT** use `root` or an account with `sudo` to replace `<serverUser>` occurrences.

6. Start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable vex-server
sudo systemctl start vex-server
```

## 🌐 Secure Remote Access with Tailscale

Tailscale allows your Pi to join a private, encrypted network that works from anywhere — without port forwarding, public IPs, or opening up your network to risk.
> [!NOTE]
> After configuring Tailscale, `<pi-ip>` will not longer be used. Instead, `<pi-tailscale-ip>` will be used instead, ensuring access whether cohnnected to the same WiFi network
> or not.

### 🔐 Install & Authenticate Tailscale on the Pi

1. **Install Tailscale:**
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

2. **Start the Tailscale service:**
   ```bash
   sudo tailscale up
   ```

3. **Authenticate:**
   - A login URL will appear in the terminal.
   - Visit the URL from a browser (you’ll need a Tailscale account — free for personal use).
   - Authorize the device to join your Tailscale network.

4. **Verify connection:**
   ```bash
   tailscale status
   ```
   You’ll see the Pi’s Tailscale IP (usually `100.x.x.x`), which you can use to access the server as well as any other connected devices' Tailscale IPs. 

### ✅ Benefits

- 🔒 **No need to open ports or use port forwarding**
- 🛡 **Fully encrypted and isolated virtual network**
- 🌍 **Access from anywhere as long as both devices are online**
- 📁 **Server file transfer and Public-Key authentication  functions remain intact** - no changes are needed to either 

> [!IMPORTANT] 
> On your personal device, install Tailscale too so you can use `ssh <user>@<pi-tailscale-ip>` to interact with the server securely from any network.

## 📡 Using the Server
<details>

<summary>🟩 PowerShell Commands</summary>

#### 🔼 Upload a Single `.cpp` File
```powershell
curl.exe -F "file=@main.cpp" https://<pi-tailscale-ip>:8080/upload --insecure
```
#### 📁 Upload a `.zip` Project

```powershell
curl.exe -F "file=@test.zip" https://<pi-tailscale-ip>:8080/upload_project --insecure
```
#### 🔧 Replace a file in an existing project:
```powershell
curl.exe -F "project=VexProject25" -F "path=src/main.cpp" -F "file=@main.cpp" `
  https://<pi-tailscale-ip>:8080/update_file --insecure
```

- `project`: Name of the existing project directory
- `path`: Relative path in project to replace (e.g., `src/main.cpp`)
- `file`: The file to upload and replace

> ℹ️ This triggers a `pros make` build after upload to ensure the program will still run. If it fails, the server wil still accept the file and integrate it into the project, but notifies you that the build failed and the program will not run.

#### ⚙️ Compile a `.cpp` File
```powershell

$headers = @{ "Content-Type" = "application/json" }

$body = '{"filename":"main.cpp"}'

Invoke-RestMethod -Uri https://<pi-tailscale-ip>:8080/compile -Method POST -Headers $headers -Body $body -SkipCertificateCheck

```
#### 🛠 Compile or Upload a `.zip` Project
```powershell

$headers = @{ "Content-Type" = "application/json" }

$body = '{"filename":"test.zip","mode":"compile"}'

Invoke-RestMethod -Uri https://<pi-tailscale-ip>:8080/run -Method POST -Headers $headers -Body $body -SkipCertificateCheck

```
#### 🚀 Upload Code to Brain
```powershell

$headers = @{ "Content-Type" = "application/json" }

$body = '{"filename":"main.cpp"}'

Invoke-RestMethod -Uri https://<pi-tailscale-ip>:8080/upload_code -Method POST -Headers $headers -Body $body -SkipCertificateCheck

```
> ➡️ **Tip:** Change `"mode":"compile"` to `"mode":"upload"` to upload instead.

#### 📜 View Compilation Logs

```powershell

curl.exe https://<pi-tailscale-ip>:8080/logs/<logfile.log> --insecure

```
</details>
<details>
<summary>🟦 Command Prompt (CMD) Commands</summary>

#### 🔼 Upload a Single `.cpp` File
```cmd

curl -F "file=@main.cpp" https://<pi-tailscale-ip>:8080/upload --insecure

```
#### 📁 Upload a `.zip` Project
```cmd

curl -F "file=@test.zip" https://<pi-tailscale-ip>:8080/upload_project --insecure
### Replace a file in an existing project:

#### 🔧 Command Prompt
```cmd
curl.exe -F "project=VexProject25" -F "path=src/main.cpp" -F "file=@main.cpp" ^
  https://<pi-tailscale-ip>:8080/update_file --insecure
```

#### 🔧 Replace a file in an existing project:
```cmd
curl.exe -F "project=VexProject25" -F "path=src/main.cpp" -F "file=@main.cpp" ^
  https://<pi-tailscale-ip>:8080/update_file --insecure
```

- `project`: Name of the existing project directory
- `path`: Relative path in project to replace (e.g., `src/main.cpp`)
- `file`: The file to upload and replace

> ℹ️ This triggers a `pros make` build after upload. If it fails, the server still accepts the file, but notifies you that the build failed.

#### ⚙️ Compile a `.cpp` File
```cmd
curl -X POST -H "Content-Type: application/json" -d "{\"filename\":\"main.cpp\"}" https://<pi-tailscale-ip>:8080/compile --insecure
```
#### 🛠 Compile or Upload a `.zip` Project
```cmd
curl -X POST -H "Content-Type: application/json" -d "{\"filename\":\"test.zip\",\"mode\":\"compile\"}" https://<pi-tailscale-ip>:8080/run --insecure
```
#### 🚀 Upload Code to Brain
```cmd
curl -X POST -H "Content-Type: application/json" -d "{\"filename\":\"main.cpp\"}" https://<pi-tailscale-ip>:8080/upload_code --insecure
```
> ➡️ **Tip:** Change `"mode":"compile"` to `"mode":"upload"` to upload instead.
#### 📜 View Compilation Logs
```cmd
curl https://<pi-tailscale-ip>:8080/logs/<logfile.log> --insecure
```
</details>

## 🐞 Troubleshooting

| Problem                           | Fix                                                                                             |
|-----------------------------------|-------------------------------------------------------------------------------------------------|
| ❌ **Permission denied on cert**     | Ensure the `.key` file is readable by the service user. Run `sudo chmod 600 <file>` and ensure ownership is correct (`chown`). |
| ❌ **Empty reply from server**      | Confirm `uvicorn` is running (`sudo systemctl status vex-server`). Also check port/firewall settings and that your IP is correct. |
| ❌ **Systemd service won't start**  | Run `sudo journalctl -u vex-server -n 50` to see logs. Look for file path errors, permission issues, or missing Python dependencies. |
| ❌ **Upload fails despite file existing** | Verify file path casing and spacing (especially on Windows), and check if the file was saved in the `uploads/` directory. |
| ❌ **SSH not working**              | Ensure SSH was enabled during Pi setup. Run `sudo systemctl status ssh`, and confirm your public key is in `/home/<user>/.ssh/authorized_keys`. |
| ❌ **PROS upload fails**           | Ensure the VEX Brain is USB-connected. Run `pros upload` manually first to confirm it works. Check if the udev rules for PROS are installed. |
| ❌ **`pros` not found in service** | When using `systemd`, ensure `/usr/local/bin` (or wherever `pros` is installed) is in the `PATH`. Modify the service file's `Environment=` or use full path `/usr/local/bin/pros`. |
| ❌ **Build fails after replacing a file** | Even if the build fails, your upload succeeds. Check logs in the `logs/` directory for compilation errors and fix your code. |
| ❌ **ZIP uploads don’t compile**   | Ensure the project structure inside the zip is a valid PROS project, not just a loose `src/`. The top-level directory must contain `project.pros`. |
| ❌ **`curl` gives JSON or syntax error (Windows)** | Use escaped quotes with `curl.exe` in CMD/PowerShell: `curl.exe -X POST -H "Content-Type: application/json" -d "{\"filename\": \"main.cpp\"}" ...` |

## 📬 Contact

Questions? Bugs? Feature requests?

- 🛠 GitHub Issues: [Open an issue](https://github.com/DiamondJdev/VexV5PiServer/issues)
- 📧 Email: diamondjdev@gmail.com
- 💬 Discord: `apx_diamond86`


## 💸 Donate

Love this project? Want to support future features like:

- Web UI with uploading and Brain telemetry stats
- VS Code + PROS extensions
- Remote Autonmous and skills runs w/ cameras

> 🚧 Donation page coming soon — stay tuned!

---

Built with 🧠, 🔧, and way too much ☕ by **@DiamondJdev | BWHS 719RIP**
