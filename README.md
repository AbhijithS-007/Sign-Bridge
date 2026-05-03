# SignBridge 🤝

> **Real-time American Sign Language (ASL) recognition in the browser — powered by MediaPipe & TensorFlow.js**

SignBridge bridges the gap between the hearing and the deaf community. Learn, practice and translate ASL letters (A–Z) and numbers (0–9) in real time, directly from your webcam — no downloads, no server, no privacy concerns.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Real-time recognition** | 30fps hand tracking via MediaPipe HandLandmarker |
| **Alphabet A–Z** | MLP classifier trained on ~87,000 real ASL images (Kaggle dataset) |
| **Numbers 0–9** | MLP classifier trained on ASL digit images + O→0 mapping |
| **Hold-to-confirm** | 1-second hold mechanic prevents false triggers |
| **Mode toggle** | Press `M` to switch between Letters and Numbers |
| **Keyboard shortcuts** | `Space` for space, `Backspace` to delete |
| **Glassmorphism UI** | Scroll-based single-page design with parallax backgrounds |
| **Fully private** | All inference runs locally — webcam never leaves your device |

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/SignBridge.git
cd SignBridge

# Start a local server (Python)
python -m http.server 8080

# Open in browser
# http://localhost:8080
```

> ⚠️ **Important:** The `.bin` model weight files are excluded from this repo due to GitHub's 100MB file limit. You need to train the models yourself using the Colab notebooks below, or download pre-trained weights.

---

## 🧠 Training the Models

Two Jupyter notebooks in the `notebooks/` folder handle training:

| Notebook | Purpose |
|---|---|
| `Notebook2_Alphabet_CNN.ipynb` | Trains A–Z alphabet classifier on Kaggle ASL Alphabet dataset |
| `Notebook3_Numbers_MLP.ipynb` | Trains 0–9 digit classifier on ASL digit images |

### Steps
1. Upload the notebook to **Google Colab**
2. Upload your `kaggle.json` API token (from kaggle.com → Account → API)
3. Run All
4. Download the output `*_model.zip`
5. Unzip into the respective `models/` folder

### Model directory structure
```
models/
├── alpha_model/
│   ├── model.json          # ✅ included
│   ├── metadata.json       # ✅ included
│   └── group1-shard1of1.bin  # ❌ train locally (not in repo)
└── numbers_model/
    ├── model.json          # ✅ included
    ├── metadata.json       # ✅ included
    └── group1-shard1of1.bin  # ❌ train locally (not in repo)
```

---

## 🛠️ Tech Stack

- **Frontend:** HTML5, CSS3 (Glassmorphism), Vanilla JavaScript
- **Hand Tracking:** [MediaPipe HandLandmarker](https://mediapipe.dev) `@0.10.12`
- **Inference:** [TensorFlow.js](https://js.tensorflow.org) `@4.22.0`
- **Training:** Python, MediaPipe, TensorFlow/Keras, TensorFlow.js converter
- **Dataset:** Kaggle ASL Alphabet + ASL Digit datasets

---

## 📁 Project Structure

```
SignBridge/
├── index.html          # Main single-page application
├── style.css           # Glassmorphism UI + scroll sections
├── script.js           # ASL recognition engine (MediaPipe + TF.js)
├── app.js              # Scroll animations, nav highlighting
├── assets/
│   └── images/         # Background images, logo, ASL charts
├── models/
│   ├── alpha_model/    # A-Z MLP model (TF.js format)
│   └── numbers_model/  # 0-9 MLP model (TF.js format)
└── notebooks/
    ├── Notebook2_Alphabet_CNN.ipynb
    └── Notebook3_Numbers_MLP.ipynb
```

---

## 🌍 About

SignBridge was built to promote sign language literacy and empower the deaf and specially-abled community. Over **500,000 people** in the United States are functionally deaf; millions more worldwide rely on sign language as their primary means of communication.

We believe learning sign language should be **fun, interactive, and accessible to everyone** — at your own pace, in your own way.

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

*Made with ❤️ for the deaf community · Powered by ASL · 2026*
