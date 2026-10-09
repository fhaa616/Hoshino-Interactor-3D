@echo off
echo Membuka http://localhost:8000 ... (tutup jendela ini untuk menghentikan server)
start "" http://localhost:8000
py -m http.server 8000 || python -m http.server 8000