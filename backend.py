
import io
import os
from dotenv import load_dotenv
import modal
from PIL import Image


# 1. Load environment variables and initialize App
load_dotenv()
app = modal.App("sketch-to-character-v2")

# Create a clean linux build image with exactly the required dependencies
cuda_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "diffusers==0.26.3",
        "huggingface-hub==0.23.5",
        "transformers==4.38.2",
        "accelerate",
        "torch",
        "Pillow",
        "peft",
        "fastapi[standard]"
    )
)

# 2. Download Weights to a Cached Path inside the persistent image layers
with cuda_image.imports():
    import torch
    from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, EulerAncestralDiscreteScheduler

# 3. Create the Production Service Class
@app.cls(image=cuda_image, gpu="L4", timeout=60, startup_timeout=800, min_containers=0, max_containers=5)
class CharacterEngine:
    @modal.enter()
    def load_pipeline(self):
        """Runs once when container wakes up, caching model weights directly in GPU VRAM"""
        print("⏳ Initializing Model Pipelines inside GPU Core...")
        
        # Load structural control constraints
        controlnet = ControlNetModel.from_pretrained(
            "xinsir/anime-painter", 
            torch_dtype=torch.float16,
            use_safetensors=True
        )
        
        # Base engine model choice optimized for vibrant cartoon/anime styles
        model_id = "cagliostrolab/animagine-xl-3.1" 
        
        self.pipe = StableDiffusionXLControlNetPipeline.from_pretrained(
            model_id,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            use_safetensors=True
        )
        
        self.pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(self.pipe.scheduler.config)
        self.pipe.to("cuda")
        print("✅ Pipeline fully loaded into VRAM.")

    def process_image_internal(self, request_data: dict):
        """Internal image generation method"""
        import base64
        
        # Extract frontend variables
        style_type = request_data.get("style", "chibi")
        base64_sketch = request_data.get("image") # Raw base64 string from HTML5 Canvas
        
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
            output_image = self.pipe(
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

    @modal.asgi_app(label="generate-character")
    def fastapi_app(self):
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        
        web_app = FastAPI()
        
        web_app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        
        @web_app.post("/")
        async def generate(request_data: dict):
            return self.process_image_internal(request_data)
            
        return web_app

