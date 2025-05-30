from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import os, subprocess, uuid, shutil
from datetime import datetime

app = FastAPI()

UPLOAD_DIR = "uploads"
LOG_DIR = "logs"
COMPILED_DIR = "compiled"
SCRIPT_PATH = "compile_upload.sh"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)
os.makedirs(COMPILED_DIR, exist_ok=True)

class FileAction(BaseModel):
    filename: str

class ZipAction(BaseModel):
    filename: str
    mode: str  # "compile" or "upload"

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".cpp"):
        raise HTTPException(status_code=400, detail="Only .cpp files accepted.")
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        f.write(await file.read())
    return {"status": "file saved", "path": save_path}

@app.post("/upload_project")
async def upload_project(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files supported.")
    zip_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(zip_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return {"status": "project zip uploaded", "path": zip_path}

@app.get("/list")
def list_files():
    return {"files": os.listdir(UPLOAD_DIR)}

@app.post("/compile")
def compile_code(req: FileAction):
    fname = req.filename
    if fname not in os.listdir(UPLOAD_DIR):
        raise HTTPException(status_code=404, detail="File not found.")
    log_id = str(uuid.uuid4())
    log_path = os.path.join(LOG_DIR, f"{log_id}.log")
    subprocess.run(["bash", SCRIPT_PATH, fname, "compile", log_path])
    return {"status": "compilation triggered", "log": log_path}

@app.post("/upload_code")
def upload_code(req: FileAction):
    fname = req.filename
    if fname not in os.listdir(UPLOAD_DIR):
        raise HTTPException(status_code=404, detail="File not found.")
    log_id = str(uuid.uuid4())
    log_path = os.path.join(LOG_DIR, f"{log_id}.log")
    subprocess.run(["bash", SCRIPT_PATH, fname, "upload", log_path])
    return {"status": "upload triggered", "log": log_path}

@app.post("/update_file")
async def update_file(
    project: str = Form(...),
    path: str = Form(...),
    file: UploadFile = File(...)
):
    target_dir = os.path.join(COMPILED_DIR, "project", project)
    if not os.path.isdir(target_dir):
        raise HTTPException(status_code=404, detail="Project not found")

    target_file = os.path.join(target_dir, path)
    os.makedirs(os.path.dirname(target_file), exist_ok=True)

    with open(target_file, "wb") as f:
        f.write(await file.read())

    # Try building with PROS
    result = subprocess.run(["/home/<serverUser>/server/.venv/bin/pros", "make"], cwd=target_dir, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    build_success = result.returncode == 0

    return {
        "status": "file uploaded",
        "path": target_file,
        "build_success": build_success,
        "message": "Build failed, please check syntax" if not build_success else "Build succeeded"
    }

@app.post("/run")
def run_project(req: ZipAction):
    zip_path = os.path.join(UPLOAD_DIR, req.filename)
    if not os.path.exists(zip_path):
        raise HTTPException(status_code=404, detail="File not found")
    if req.mode not in ["compile", "upload"]:
        raise HTTPException(status_code=400, detail="Invalid mode")

    logname = f"log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    log_path = os.path.join(LOG_DIR, logname)

    try:
        subprocess.run(["bash", SCRIPT_PATH, req.filename, req.mode, log_path], check=True)
    except subprocess.CalledProcessError:
        raise HTTPException(status_code=500, detail="Script failed. Check log.", headers={"X-Log-Path": log_path})

    return {"message": f"{req.mode} finished", "log": log_path}