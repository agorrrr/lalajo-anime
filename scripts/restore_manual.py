import shutil
import os

SRC = r"C:\Users\rezam\Documents\samehadaku-clone\data\anime_manual_backup.json"
DST = r"C:\Users\rezam\Documents\samehadaku-clone\data\anime.json"

if os.path.exists(SRC):
    shutil.copyfile(SRC, DST)
    print("Berhasil mengembalikan data anime ke versi manual!")
else:
    print("File backup manual tidak ditemukan.")
