# %% [markdown]
# # 🤟 SignBridge — ASL Word Signs Model Training
# 
# Train a **Bidirectional LSTM** to recognize **250 ASL word signs** using the
# [Google Isolated Sign Language Recognition](https://www.kaggle.com/competitions/asl-signs) dataset.
#
# **Runtime:** Set to **T4 GPU** (Runtime → Change runtime type → T4 GPU)

# %% [markdown]
# ## 1. Setup & Dependencies

# %%
# Install required packages
!pip install -q kaggle tensorflowjs pyarrow fastparquet

# %%
# Upload your kaggle.json API key
# Go to kaggle.com → Account → Create New API Token → download kaggle.json
from google.colab import files
import os

if not os.path.exists('/root/.kaggle/kaggle.json'):
    print("📤 Upload your kaggle.json file:")
    uploaded = files.upload()
    os.makedirs('/root/.kaggle', exist_ok=True)
    with open('/root/.kaggle/kaggle.json', 'wb') as f:
        f.write(uploaded['kaggle.json'])
    os.chmod('/root/.kaggle/kaggle.json', 0o600)
    print("✅ Kaggle API key configured!")
else:
    print("✅ Kaggle API key already exists.")

# %% [markdown]
# ## 2. Download Dataset from Kaggle
#
# **⚠️ IMPORTANT:** Before running the cell below, you MUST accept the competition rules:
# 1. Go to https://www.kaggle.com/competitions/asl-signs/rules
# 2. Click "I Understand and Accept"
# 3. Then run the cell below

# %%
# Download the Google ISLR dataset
import subprocess, os

# Accept rules via API (may still need web acceptance)
subprocess.run(["kaggle", "competitions", "list", "-s", "asl-signs"], capture_output=True)

print("⬇️ Downloading dataset (this may take 2-5 minutes)...")
result = subprocess.run(
    ["kaggle", "competitions", "download", "-c", "asl-signs", "-p", "/content/asl-signs"],
    capture_output=True, text=True
)
print(result.stdout)
if result.returncode != 0:
    print("❌ Download failed! Error:", result.stderr)
    print("\n👉 Make sure you accepted the rules at:")
    print("   https://www.kaggle.com/competitions/asl-signs/rules")
else:
    print("✅ Download complete!")

# %%
# Extract the dataset
import zipfile, glob

zip_files = glob.glob("/content/asl-signs/*.zip")
if zip_files:
    print(f"📦 Extracting {zip_files[0]}...")
    with zipfile.ZipFile(zip_files[0], 'r') as z:
        z.extractall("/content/asl-signs/")
    print("✅ Dataset extracted!")
else:
    print("❌ No zip file found in /content/asl-signs/")
    print("   Contents:", os.listdir("/content/asl-signs/") if os.path.exists("/content/asl-signs/") else "directory missing")

# Verify key files exist
for f in ["train.csv", "sign_to_prediction_index_map.json"]:
    path = f"/content/asl-signs/{f}"
    if os.path.exists(path):
        print(f"  ✅ {f}")
    else:
        print(f"  ❌ {f} — MISSING!")

!ls /content/asl-signs/ | head -20

# %% [markdown]
# ## 3. Load & Explore Data

# %%
import json
import numpy as np
import pandas as pd
from pathlib import Path
from tqdm.notebook import tqdm

# Load the sign-to-index mapping (250 words)
with open('/content/asl-signs/sign_to_prediction_index_map.json', 'r') as f:
    sign_to_idx = json.load(f)

idx_to_sign = {v: k for k, v in sign_to_idx.items()}
NUM_CLASSES = len(sign_to_idx)
print(f"📊 Number of word classes: {NUM_CLASSES}")
print(f"📝 Example words: {list(sign_to_idx.keys())[:20]}")

# %%
# Load the training metadata
train_df = pd.read_csv('/content/asl-signs/train.csv')
print(f"📊 Total training samples: {len(train_df)}")
print(f"📊 Unique participants: {train_df['participant_id'].nunique()}")
print(train_df.head())

# %%
# Check class distribution
class_counts = train_df['sign'].value_counts()
print(f"📊 Min samples per class: {class_counts.min()} ({class_counts.idxmin()})")
print(f"📊 Max samples per class: {class_counts.max()} ({class_counts.idxmax()})")
print(f"📊 Mean samples per class: {class_counts.mean():.0f}")

# %% [markdown]
# ## 4. Preprocessing Pipeline

# %%
# ─── Configuration ───
SEQ_LENGTH = 32          # Fixed sequence length (pad/truncate)
HAND_LANDMARKS = 21      # MediaPipe hand landmarks per hand
COORDS = 3               # x, y, z
NUM_FEATURES = 2 * HAND_LANDMARKS * COORDS  # 126 (both hands)

# Hand landmark column indices in the parquet files
# Each parquet has columns: type, landmark_index, x, y, z
# Types: face, left_hand, pose, right_hand

print(f"📐 Sequence length: {SEQ_LENGTH}")
print(f"📐 Features per frame: {NUM_FEATURES}")
print(f"📐 Input shape: ({SEQ_LENGTH}, {NUM_FEATURES})")

# %%
def load_parquet_landmarks(filepath):
    """Load a single parquet file and extract hand landmarks only."""
    try:
        df = pd.read_parquet(filepath)
    except Exception as e:
        return None

    # Get unique frame indices
    frames = sorted(df['frame'].unique())
    n_frames = len(frames)

    if n_frames == 0:
        return None

    sequence = np.zeros((n_frames, NUM_FEATURES), dtype=np.float32)

    for i, frame_idx in enumerate(frames):
        frame_data = df[df['frame'] == frame_idx]

        # Left hand (21 landmarks × 3 coords = 63 features)
        lh = frame_data[frame_data['type'] == 'left_hand'].sort_values('landmark_index')
        if len(lh) == HAND_LANDMARKS:
            lh_coords = lh[['x', 'y', 'z']].values.flatten()
            sequence[i, :63] = lh_coords

        # Right hand (21 landmarks × 3 coords = 63 features)
        rh = frame_data[frame_data['type'] == 'right_hand'].sort_values('landmark_index')
        if len(rh) == HAND_LANDMARKS:
            rh_coords = rh[['x', 'y', 'z']].values.flatten()
            sequence[i, 63:126] = rh_coords

    return sequence


def normalize_sequence(seq):
    """Normalize each hand relative to its wrist (landmark 0) per frame."""
    normalized = seq.copy()
    for i in range(len(seq)):
        # Left hand: landmarks 0-20, coords at indices 0-62
        lh = normalized[i, :63].reshape(21, 3)
        if np.any(lh != 0):  # Only normalize if hand is present
            wrist = lh[0].copy()
            lh -= wrist
            max_val = np.max(np.abs(lh)) or 1.0
            lh /= max_val
            normalized[i, :63] = lh.flatten()

        # Right hand: landmarks 0-20, coords at indices 63-125
        rh = normalized[i, 63:126].reshape(21, 3)
        if np.any(rh != 0):
            wrist = rh[0].copy()
            rh -= wrist
            max_val = np.max(np.abs(rh)) or 1.0
            rh /= max_val
            normalized[i, 63:126] = rh.flatten()

    return normalized


def pad_or_truncate(seq, target_len):
    """Pad with zeros or truncate to target_len frames."""
    n = len(seq)
    if n >= target_len:
        # Center-crop if too long
        start = (n - target_len) // 2
        return seq[start:start + target_len]
    else:
        # Pad with zeros at the end
        pad_width = target_len - n
        return np.pad(seq, ((0, pad_width), (0, 0)), mode='constant')

# %% [markdown]
# ## 5. Build Dataset Arrays

# %%
import gc

# Process all training samples
X_all = []
y_all = []
skipped = 0

print("📂 Loading and preprocessing landmark sequences...")
for idx, row in tqdm(train_df.iterrows(), total=len(train_df), desc="Processing"):
    filepath = f"/content/asl-signs/{row['path']}"

    seq = load_parquet_landmarks(filepath)
    if seq is None:
        skipped += 1
        continue

    # Replace NaN with 0
    seq = np.nan_to_num(seq, nan=0.0)

    # Normalize
    seq = normalize_sequence(seq)

    # Pad/truncate
    seq = pad_or_truncate(seq, SEQ_LENGTH)

    X_all.append(seq)
    y_all.append(sign_to_idx[row['sign']])

print(f"\n✅ Loaded {len(X_all)} samples (skipped {skipped})")

X_all = np.array(X_all, dtype=np.float32)
y_all = np.array(y_all, dtype=np.int32)
print(f"📐 X shape: {X_all.shape}")  # (N, 32, 126)
print(f"📐 y shape: {y_all.shape}")  # (N,)

gc.collect()

# %%
# Train/validation split (stratified)
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow import keras

X_train, X_val, y_train, y_val = train_test_split(
    X_all, y_all, test_size=0.15, random_state=42, stratify=y_all
)

# One-hot encode labels
y_train_oh = keras.utils.to_categorical(y_train, NUM_CLASSES)
y_val_oh   = keras.utils.to_categorical(y_val, NUM_CLASSES)

print(f"📊 Training:   {X_train.shape[0]} samples")
print(f"📊 Validation: {X_val.shape[0]} samples")

# Free memory
del X_all, y_all
gc.collect()

# %% [markdown]
# ## 6. Data Augmentation

# %%
class SignAugmentation(keras.layers.Layer):
    """Custom augmentation for sign language sequences (applied during training only)."""

    def call(self, inputs, training=None):
        if not training:
            return inputs

        x = inputs

        # 1. Random time shift (shift sequence left/right by a few frames)
        if tf.random.uniform(()) > 0.5:
            shift = tf.random.uniform((), minval=-3, maxval=3, dtype=tf.int32)
            x = tf.roll(x, shift=shift, axis=1)

        # 2. Random Gaussian noise on coordinates
        if tf.random.uniform(()) > 0.5:
            noise = tf.random.normal(tf.shape(x), mean=0.0, stddev=0.02)
            x = x + noise

        # 3. Random frame dropout (zero out some frames)
        if tf.random.uniform(()) > 0.7:
            mask = tf.random.uniform((tf.shape(x)[1],)) > 0.1  # Drop ~10% of frames
            mask = tf.cast(mask, tf.float32)
            mask = tf.reshape(mask, [1, -1, 1])
            x = x * mask

        # 4. Random spatial scaling
        if tf.random.uniform(()) > 0.5:
            scale = tf.random.uniform((), minval=0.9, maxval=1.1)
            x = x * scale

        return x

# %% [markdown]
# ## 7. Build Model

# %%
def build_word_model(seq_length, num_features, num_classes):
    """Bidirectional LSTM model for ASL word sign recognition."""

    inputs = keras.layers.Input(shape=(seq_length, num_features), name="landmark_input")

    # Augmentation (training only)
    x = SignAugmentation()(inputs)

    # Masking: skip frames that are all zeros (padding)
    x = keras.layers.Masking(mask_value=0.0)(x)

    # BiLSTM block 1
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(128, return_sequences=True, dropout=0.2, recurrent_dropout=0.1)
    )(x)
    x = keras.layers.BatchNormalization()(x)

    # BiLSTM block 2
    x = keras.layers.Bidirectional(
        keras.layers.LSTM(64, return_sequences=False, dropout=0.2, recurrent_dropout=0.1)
    )(x)
    x = keras.layers.BatchNormalization()(x)

    # Dense head
    x = keras.layers.Dense(256, activation='relu')(x)
    x = keras.layers.BatchNormalization()(x)
    x = keras.layers.Dropout(0.4)(x)

    x = keras.layers.Dense(128, activation='relu')(x)
    x = keras.layers.Dropout(0.3)(x)

    outputs = keras.layers.Dense(num_classes, activation='softmax', name="word_output")(x)

    model = keras.Model(inputs, outputs, name="SignBridge_WordModel")
    return model


model = build_word_model(SEQ_LENGTH, NUM_FEATURES, NUM_CLASSES)
model.summary()

# %%
# Compile
model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=1e-3),
    loss=keras.losses.CategoricalCrossentropy(label_smoothing=0.1),
    metrics=['accuracy']
)

# %% [markdown]
# ## 8. Train

# %%
# Callbacks
callbacks = [
    keras.callbacks.EarlyStopping(
        monitor='val_accuracy',
        patience=10,
        restore_best_weights=True,
        verbose=1
    ),
    keras.callbacks.ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=1e-6,
        verbose=1
    ),
    keras.callbacks.ModelCheckpoint(
        '/content/best_word_model.keras',
        monitor='val_accuracy',
        save_best_only=True,
        verbose=1
    )
]

# %%
# Train!
print("🚀 Starting training...")
history = model.fit(
    X_train, y_train_oh,
    validation_data=(X_val, y_val_oh),
    epochs=80,
    batch_size=64,
    callbacks=callbacks,
    verbose=1
)

# %% [markdown]
# ## 9. Evaluate & Visualize

# %%
import matplotlib.pyplot as plt

fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Accuracy
axes[0].plot(history.history['accuracy'], label='Train')
axes[0].plot(history.history['val_accuracy'], label='Validation')
axes[0].set_title('Model Accuracy')
axes[0].set_xlabel('Epoch')
axes[0].set_ylabel('Accuracy')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# Loss
axes[1].plot(history.history['loss'], label='Train')
axes[1].plot(history.history['val_loss'], label='Validation')
axes[1].set_title('Model Loss')
axes[1].set_xlabel('Epoch')
axes[1].set_ylabel('Loss')
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('/content/training_curves.png', dpi=150)
plt.show()

# %%
# Final evaluation
val_loss, val_acc = model.evaluate(X_val, y_val_oh, verbose=0)
print(f"\n📊 Final Validation Accuracy: {val_acc:.4f} ({val_acc*100:.1f}%)")
print(f"📊 Final Validation Loss: {val_loss:.4f}")

# %%
# Top-5 accuracy
from sklearn.metrics import top_k_accuracy_score

y_pred_probs = model.predict(X_val, verbose=0)
top5 = top_k_accuracy_score(y_val, y_pred_probs, k=5)
print(f"📊 Top-5 Accuracy: {top5:.4f} ({top5*100:.1f}%)")

# %%
# Confusion matrix for worst classes
from sklearn.metrics import classification_report

y_pred = np.argmax(y_pred_probs, axis=1)
report = classification_report(y_val, y_pred, target_names=[idx_to_sign[i] for i in range(NUM_CLASSES)], output_dict=True)

# Find worst performing classes
worst = sorted(
    [(k, v['f1-score'], v['support']) for k, v in report.items() if k in idx_to_sign.values()],
    key=lambda x: x[1]
)[:10]

print("\n⚠️ 10 Hardest Signs:")
for sign, f1, support in worst:
    print(f"  {sign:15s}  F1={f1:.3f}  (n={int(support)})")

# %% [markdown]
# ## 10. Export for TensorFlow.js

# %%
# Load best model
best_model = keras.models.load_model('/content/best_word_model.keras')

# ─── IMPORTANT ───
# TF.js doesn't support Masking + BiLSTM + recurrent_dropout well.
# We rebuild a clean inference model WITHOUT augmentation and masking.

inference_inputs = keras.layers.Input(shape=(SEQ_LENGTH, NUM_FEATURES), name="landmark_input")

# Replicate the trained layers but skip augmentation + masking
x = inference_inputs
for layer in best_model.layers:
    if isinstance(layer, (keras.layers.InputLayer, SignAugmentation, keras.layers.Masking)):
        continue
    x = layer(x)

inference_model = keras.Model(inference_inputs, x, name="SignBridge_WordModel_Inference")
inference_model.summary()

# Verify inference model matches
val_loss2, val_acc2 = inference_model.compile(
    optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy']
) or (None, None)
# Quick check
preds_orig = best_model.predict(X_val[:10], verbose=0)
preds_inf  = inference_model.predict(X_val[:10], verbose=0)
print(f"✅ Max prediction difference: {np.max(np.abs(preds_orig - preds_inf)):.8f}")

# %%
# Save as SavedModel format first
inference_model.save('/content/words_savedmodel')
print("✅ SavedModel saved")

# %%
# Convert to TensorFlow.js
!tensorflowjs_converter \
    --input_format=tf_saved_model \
    --output_format=tfjs_graph_model \
    --signature_name=serving_default \
    --saved_model_tags=serve \
    /content/words_savedmodel \
    /content/words_tfjs_model

print("✅ TF.js model converted!")
!ls -la /content/words_tfjs_model/

# %%
# Also save the word classes mapping
word_classes = [idx_to_sign[i] for i in range(NUM_CLASSES)]

with open('/content/words_tfjs_model/word_classes.json', 'w') as f:
    json.dump(word_classes, f, indent=2)

print(f"✅ Saved {len(word_classes)} word classes")
print(f"📝 First 20: {word_classes[:20]}")

# %%
# Save model config for JS inference
config = {
    "seq_length": SEQ_LENGTH,
    "num_features": NUM_FEATURES,
    "num_classes": NUM_CLASSES,
    "hand_landmarks": HAND_LANDMARKS,
    "coords": COORDS,
    "model_type": "graph_model",
    "normalization": "wrist_relative_max_abs"
}

with open('/content/words_tfjs_model/model_config.json', 'w') as f:
    json.dump(config, f, indent=2)

print("✅ Model config saved")

# %% [markdown]
# ## 11. Download Model Files

# %%
# Zip everything for download
!cd /content && zip -r words_model_tfjs.zip words_tfjs_model/

# Download
from google.colab import files
files.download('/content/words_model_tfjs.zip')

print("""
╔══════════════════════════════════════════════════════════╗
║  🎉 DONE! Download complete.                            ║
║                                                          ║
║  Extract the zip and place files into:                   ║
║  RT_SL_Translator/models/words_model/                    ║
║                                                          ║
║  Files:                                                  ║
║    • model.json          (model topology)                ║
║    • group1-shard*.bin   (weights)                       ║
║    • word_classes.json   (250 word labels)               ║
║    • model_config.json   (inference config)              ║
╚══════════════════════════════════════════════════════════╝
""")
