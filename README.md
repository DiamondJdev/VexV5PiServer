# VEX Remote Code Upload Server (Pi Bridge)

Remotely upload and execute VEX V5 code from anywhere using a **Raspberry Pi 4** as a secure USB bridge to the VEX Brain. This project sets up a headless Pi server that allows authenticated users to upload `.cpp` files, compile them using PROS, and flash them directly to the brain — all over Wi-Fi! 🛰️

---

## 📦 Materials Needed

| Component        | Recommended Model                        | Notes                                 |
|------------------|------------------------------------------|---------------------------------------|
| Raspberry Pi     | Pi 4 (2GB RAM or higher)                 | Must be 64-bit capable                |
| MicroSD Card     | 16GB+ Class 10                           | Use Raspberry Pi Imager to flash OS   |
| Power Supply     | Official Pi 4 PSU                        | 5V/3A recommended                     |
| USB-A to USB-C   | Official VEX programming cable           | For connecting Pi → VEX V5 Brain      |
| Computer         | Any SSH capable device(Windows/Linux/Mac)| To SSH into Pi and send commands      |
| Wi-Fi Connection | Stable 2.4GHz or 5GHz connection         | Headless Pi requires network access   |

---

## 📖 Table of Contents

1. [🔧 Setup Overview](#-setup-overview)
2. [🚀 Flashing the Pi](#-flashing-the-pi)
3. [🛠️ First Boot & SSH Access](#-first-boot--ssh-access)
4. [🌐 Installing the Server](#-installing-the-server)
5. [📡 Using the Server](#-using-the-server)
6. [🐞 Troubleshooting](#-troubleshooting)
7. [📬 Contact](#-contact)
8. [💸 Donate](#-donate)

---

## 🔧 Setup Overview

This project installs a **FastAPI Python server** on your Pi, which listens for upload requests and flashes VEX code using PROS. It runs on a port of your choosing (See [chapter 4](#-installing-the-server)) and uses SSH and HTTPS for encrypted communication.

---

## 🚀 Flashing the Pi

1. 🔗 Download **Raspberry Pi Imager**  
   [Official Link](https://www.raspberrypi.com/software/)
2. Select Raspberry Pi 4 as the device, Raspberry Pi OS Lite (64-bit) as the OS and an external USB drive, MicroSD card, or NVME M.2 drive as storage. (Compatability will depend on Raspberry Pi 4 model used). Select ***NEXT*** 
3. 📂 When asked for ***OS customization settings*** select ***EDIT SETTINGS*** and set Raspberry Pi's name, default username and password (Will be used for SSH in [Chapter 3](#-first-boot--ssh-access)) and WiFi Settings.
  > [!IMPORTANT]
  > Remember the username and password used, as this will be the only way to gain access into the Raspberry Pi at this stage. Forgetting the username or password will require you to re-image the storage device used
5. Select the ***SERVICES*** tab, enable SSH and your desired authentication technique.
  > [!WARNING]  
  > Public-key authentication is vastly more secure and will not require a password each login so it will be used throughout this guide, but password authentication is much easier to setup and use if you are not comfortable with linux, encryption keys, and RSA. If you opt for Public-key authentication, select the Allow public-key authentication only option and press the ***RUN SSH-KEYGEN*** button.

  > [!CAUTION]
  > Failure to enable SSH at this stage in setup will result in longer setup times and will require you to use the Pi directly. As such, setting up SSH will not be covered in this guide.  
6. Wait for the imager to complete loading the image, then eject the storage device from the original computer and move to Raspberry Pi. You can now power on the Raspberry Pi (DO NOT POWER ON PI BEFORE INSERTING STORAGE DEVICE)

---

## 🛠️ First Boot & SSH Access

1. Wait for Raspberry Pi to complete booting and reach the landing screen. We opted for a "headless" Operating System, which means we won't have a GUI and will complete all operations using the terminal.
2. Once the Pi reaches it's landing screen (IP Listed at top, awaiting username for login), we can SSH into it from our main machine
  * If you have enabled SHH via password simply run ```ssh <username>@<Pi's IP>``` then save the fingerprint when asked and enter your user's password. You should now have access to the Raspberry Pi.
  * If you have enabled SSH via Public-key, the process takes a bit longer. First, on your Raspberry Pi, start the SSH agent using ```eval "$(ssh-agent -s)"``` and add your key identities to ssh-agent with the following command: ```ssh-add ~/.ssh/id_rsa```. Next, on your main computer, run ```ssh-keygen -t rsa``` then ```ssh-copy-id <username>@<Pi's IP>``` to share your computers public key. Finally, use ```ssh <username>@<Pi's IP>``` on your main computer to connect to the Pi without needing to use a password. If your computer does not support ssh-copy-id, you must use ```scp .ssh/id_rsa.pub <username>@<Pi's IP>:.ssh/authorized_keys``` to share your public key instead.
3. Now that you have SSH access into the Pi, it's time to begin install the server software and preparing the Pi to connect to the brain.

---

## 🌐 Installing the Server

Now that you have remote access into the Raspberry Pi, you can now begin to load the actual server onto the Pi. In this GitHub repository, 

1. Update and install basics
```
$ sudo apt update && sudo apt full-upgrade -y
$ sudo apt install python3-venv python3-pip gcc-arm-none-eabi libusb-1.0-0-dev git curl -y
```
2. Create server folder
```
$ mkdir ~/server && cd ~/server
$ python3 -m venv .venv
$ source .venv/bin/activate
$ pip install "fastapi[all]" "uvicorn[standard]" pros-cli
```
3. Clone the repo and set up files
```
$ git clone https://github.com/DiamondJdev/VexV5PiServer
```
4. Create and secure SSL certs
```
$ mkdir ssl
$ openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/server.key -out ssl/server.crt
$ chmod 600 ssl/server.key
$ chmod 644 ssl/server.crt
```
5. Set up systemd
```
$ sudo nano /etc/systemd/system/vex-server.service
```
Example config:
```
[Unit]
Description=Pi Bridge Server
After=network.target

[Service]
User=<username>
WorkingDirectory=/home/<username>/server
ExecStart=/home/<username>/server/.venv/bin/uvicorn main:app \
    --host 0.0.0.0 --port 443 \
    --ssl-keyfile=/home/<username>/server/ssl/server.key \
    --ssl-certfile=/home/<username>/server/ssl/server.crt
Restart=always

[Install]
WantedBy=multi-user.target
```
6. Start the server
```
sudo systemctl daemon-reload
sudo systemctl enable vex-server
sudo systemctl start vex-server
```

---

## 📡 Using the Server
* Upload Code:
```
$ curl -F 'file=@main.cpp' https://<pi-ip>/upload --insecure
```
* Compile:
```
$ curl -X POST -H "Content-Type: application/json" \
  -d '{"filename":"main.cpp"}' \
  https://<pi-ip>/compile --insecure
```
* Upload to Brain:
```
$ curl -X POST -H "Content-Type: application/json" \
  -d '{"filename":"main.cpp"}' \
  https://<pi-ip>/upload_code --insecure
```
* View logs:
```
$ curl https://<pi-ip>/logs/<logfile.log> --insecure
```

---

## 🐞 Troubleshooting

| Problem                          | Fix                                                                 |
|----------------------------------|---------------------------------------------------------------------|
| ❌ Permission denied on cert     | Ensure the .key file is readable by your server user                |
| ❌ curl: Empty reply from server | Check if uvicorn is actually running and bound to the right IP/port | 
| ❌ Systemd service won't start   | Use sudo journalctl -u vex-server -n 50 to view logs                | 
| ❌ Can't SSH                     | Run sudo systemctl start ssh or check network IP address            | 
| ❌ PROS won't upload	           | Ensure the VEX Brain is connected via USB and try to test manually  | 

---

## 📬 Contact

Have suggestions or run into issues?
* GitHub Issues: [Submit here](https://github.com/DiamondJdev/VexV5PiServer/)
* Email: diamondjdev@gmail.com
* Discord: apx_diamond86

## 💸 Donate
* 💖 Love the project? Want to support future features like a web UI or VS Code and PROS integration?
[🚧 Pending Donation Page — Coming Soon!]
