from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator

IMAGE_EXTS = ("jpg", "jpeg", "png", "webp")
image_extension = FileExtensionValidator(allowed_extensions=IMAGE_EXTS)


def validate_image_size(file):
    max_mb = 3
    if file.size > max_mb * 1024 * 1024:
        raise ValidationError(f"A foto deve ter no máximo {max_mb} MB.")


def validate_image_dimensions(file):
    try:
        from PIL import Image
        file.seek(0)
        img = Image.open(file)
        w, h = img.size
        file.seek(0)
    except Exception as exc:
        raise ValidationError("Arquivo de imagem inválido.") from exc
    if w < 200 or h < 200:
        raise ValidationError("A foto precisa ter pelo menos 200×200 pixels.")
    if w > 4000 or h > 4000:
        raise ValidationError("A foto não pode passar de 4000×4000 pixels.")
