import io
import os
import base64
from PIL import Image
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, EulerAncestralDiscreteScheduler
import uvicorn

# Load environment variables
load_dotenv()

# FastAPI app
app = FastAPI()

# Allow CORS for local frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model loading (runs once at startup)
print("⏳ Initializing Model Pipelines inside GPU/Core...")
controlnet = ControlNetModel.from_pretrained(
    "xinsir/anime-painter",
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32
)
model_id = "cagliostrolab/animagine-xl-3.1"
pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
    model_id,
    controlnet=controlnet,
    torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
    use_safetensors=True
)
pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
pipe.to("cuda" if torch.cuda.is_available() else "cpu")
print("✅ Pipeline fully loaded.")

# Request schema
class GenerationRequest(BaseModel):
    image: str
    style: str = "chibi"

@app.post("/generate-character")
async def generate_character(req: GenerationRequest):
    # Extract frontend variables
    style_type = req.style
    base64_sketch = req.image

    # Parse Base64 back into image pixels
    img_data = base64.b64decode(base64_sketch.split(",")[-1])
    sketch_input = Image.open(io.BytesIO(img_data)).convert("RGB").resize((1024, 1024))

    # Map style prompts dynamically
    style_prompts = {
        "chibi": "cute chibi sticker style, 3d pixar rendering, vibrant studio lighting, solid white background",
        "anime": "vibrant masterpiece anime character art, beautiful coloring, sharp lineart, solid white background",
        "watercolor": "fairytale watercolor book asset, smooth pastel textures, soft blending, solid white background"
    }
    selected_style = style_prompts.get(style_type, style_prompts["chibi"])
    prompt = f"masterpiece, exceptional quality, {selected_style}"
    negative_prompt = "low quality, bad anatomy, realistic, photorealistic, messy lines, text, dark background, borders"

    # Run inference computation cycle
    print(f"🎨 Generating character using style option: [{style_type}]")
    with torch.inference_mode():
        output_image = pipe(
            prompt=prompt,
            negative_prompt=negative_prompt,
            image=sketch_input,
            controlnet_conditioning_scale=0.9,
            num_inference_steps=25,
            guidance_scale=7.5
        ).images[0]

    # Convert generated output back to base64 bytes payload for web delivery
    buffered = io.BytesIO()
    output_image.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")

    return {"status": "success", "image": f"data:image/png;base64,{img_str}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
