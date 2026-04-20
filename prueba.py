import requests

PAGE_ID = "1097828466747607"
ACCESS_TOKEN = "EAAWzoh914AYBRRJP..."

res = requests.post(
    f"https://graph.facebook.com/v25.0/{PAGE_ID}/feed",
    data={
        "message": "ya debería funcionar 🔥",
        "access_token": ACCESS_TOKEN
    }
)

print(res.text)