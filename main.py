from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os, subprocess, uuid

app = FastAPI()
UPLOAD_DIR = "uploads"
LOG_DIR = "logs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

class FileAction(BaseModel):
    filename: str

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".cpp"):
        raise HTTPException(status_code=400, detail="Only .cpp files accepted.")
    
    save_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(save_path, "wb") as f:
        f.write(await file.read())
    return {"status": "file saved", "path": save_path}

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

    # Run bash script
    result = subprocess.run(["bash", "compile_upload.sh", fname, "compile", log_path])
    return {"status": "compilation triggered", "log": log_path}

@app.post("/upload_code")
def upload_code(req: FileAction):
    fname = req.filename
    if fname not in os.listdir(UPLOAD_DIR):
        raise HTTPException(status_code=404, detail="File not found.")
    
    log_id = str(uuid.uuid4())
    log_path = os.path.join(LOG_DIR, f"{log_id}.log")

    result = subprocess.run(["bash", "compile_upload.sh", fname, "upload", log_path])
    return {"status": "upload triggered", "log": log_path}

@app.get("/logs/{logfile}")
def get_log(logfile: str):
    full_path = os.path.join(LOG_DIR, logfile)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Log not found.")
    return FileResponse(full_path)
