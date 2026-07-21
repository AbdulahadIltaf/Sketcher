
import io
import os
from dotenv import load_dotenv
import modal
from PIL import Image


# 1. Load environment variables and initialize App
load_dotenv()
app = modal.App("sketch-to-character-v2")


# Create a clean linux build image with the required dependencies
cuda_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "diffusers==0.26.3",
        "huggingface-hub==0.23.5",
        "transformers==4.38.2",
        "accelerate",
        "torch",
        "Pillow",
        "numpy",
        "peft",
        "fastapi[standard]"
    )
)

# Import GPU libs inside the image context
with cuda_image.imports():
    import torch
    from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, EulerAncestralDiscreteScheduler

# Production Service Class
# startup_timeout=600: allows up to 10 min for model download + VRAM load on cold start
# timeout=300: covers inference time per request
@app.cls(image=cuda_image, gpu="L4", timeout=300, startup_timeout=600, min_containers=0, max_containers=5)
class CharacterEngine:
    @modal.enter()
    def load_pipeline(self):
        """Runs once when container wakes up, loading model weights into GPU VRAM"""
        print("Initializing Model Pipelines inside GPU Core...")
        
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
        """Internal image generation method with enhanced quality"""
        import base64
        import numpy as np

        # Extract frontend variables
        style_type = request_data.get("style", "chibi")
        custom_prompt = request_data.get("customPrompt", "").strip()
        base64_sketch = request_data.get("image")

        # Parse Base64 back into image pixels
        img_data = base64.b64decode(base64_sketch.split(",")[-1])
        sketch_input = Image.open(io.BytesIO(img_data)).convert("RGB").resize((768, 768))

        # Enhance sketch contrast to improve model interpretation of rough drawings
        sketch_array = np.array(sketch_input).astype(np.float32)
        sketch_array = np.clip((sketch_array - 128) * 1.5 + 128, 0, 255).astype(np.uint8)
        sketch_input = Image.fromarray(sketch_array)

        # Map style prompts with more detailed descriptors
        style_prompts = {
            "chibi": "ultra-cute chibi character sticker, 3d pixar rendering style, glossy finish, vibrant neon studio lighting, perfect face, detailed expressions, white background, masterpiece",
            "anime": "stunning anime masterpiece character, beautiful vibrant colors, sharp clean lineart, intricate details, professional illustration, anime art style, white background, highres",
            "watercolor": "beautiful fairytale watercolor painting asset, smooth artistic textures, soft color blending, dreamy aesthetic, watercolor book illustration, white background, masterpiece",
            "realistic": "realistic detailed character portrait, professional digital art, sharp focus, intricate details, studio lighting, high quality, white background, masterpiece"
        }

        selected_style = style_prompts.get(style_type, style_prompts["chibi"])

        # Combine user custom prompt with style
        if custom_prompt:
            prompt = f"masterpiece, exceptional quality, {custom_prompt}, {selected_style}"
        else:
            prompt = f"masterpiece, exceptional quality, {selected_style}"

        # Enhanced negative prompt for better quality
        negative_prompt = "low quality, blurry, bad anatomy, deformed, ugly, distorted, poorly drawn, bad proportions, broken hands, extra limbs, realistic, photorealistic, 3d render, messy, text, watermark, dark background, borders, low detail"

        # Run inference with optimized parameters
        print(f"🎨 Generating character: style=[{style_type}] custom_prompt=[{custom_prompt}]")
        with torch.inference_mode():
            output_image = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt,
                image=sketch_input,
                controlnet_conditioning_scale=0.5,  # Lower = allows more creative freedom + enhancement
                num_inference_steps=20,              # Reduced for speed while keeping good quality
                guidance_scale=7.5,                  # Balanced adherence vs creativity
                height=768,
                width=768
            ).images[0]

        # Post-process: enhance details and sharpness
        output_array = np.array(output_image).astype(np.float32)
        # Slight sharpening for better character definition
        output_array = np.clip(output_array * 1.05, 0, 255).astype(np.uint8)
        output_image = Image.fromarray(output_array)

        # Convert generated output back to base64 bytes payload for web delivery
        buffered = io.BytesIO()
        output_image.save(buffered, format="PNG", quality=95)
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
        
        @web_app.get("/health")
        async def health():
            # @modal.enter() guarantees pipeline is loaded before this runs
            return {"status": "ready"}

        @web_app.post("/")
        async def generate(request_data: dict):
            return self.process_image_internal(request_data)
            
        return web_app


