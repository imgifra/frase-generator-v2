import requests

PAGE_ID = "1097828466747607"
ACCESS_TOKEN = "EAAWzoh914AYBRU7dqavu1B0lqKECDgFzAuFQLT6D0k48yK8QSiizlW7kcGKymCbXklFcWtBnWtkGmFqqFhS1XJb5EtKWAU6NslhbbkUWhvn7RBRQ2RX7hBtfxSjXBRakPB85rN3GOWh8YKJJVHlMakZC5Adsq1I5s9PuBFbZBocEZCYbLN98PAB0ITbyuFVNZCajsU1a"
  # 👈 tu token de página

IMAGE_URL = "https://res.cloudinary.com/dymjyoqac/image/upload/v1776469817/mono_generator/tres_generaciones_mordiendo_supercocos_claro_que_podemos_con_retro3d_1776469781165.png"

url = f"https://graph.facebook.com/v25.0/{PAGE_ID}/photos"

params = {
    "url": IMAGE_URL,
    "caption": "prueba directa desde python 🚀",
    "access_token": ACCESS_TOKEN
}

res = requests.post(url, params=params)

print("STATUS:", res.status_code)
print("RESPONSE:", res.text)