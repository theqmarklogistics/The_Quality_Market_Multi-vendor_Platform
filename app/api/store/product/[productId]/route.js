import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { Buffer } from "buffer";

// Get a single product (must belong to seller's store)
export async function GET(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const storeId = await authSeller(userId);
    if (!storeId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { productId } = await params;
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message || error.code }), { status: 400 });
  }
}

// Update a product
export async function PATCH(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const storeId = await authSeller(userId);
    if (!storeId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { productId } = await params;
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }

    const formData = await request.formData();
    const name = formData.get("name");
    const description = formData.get("description");
    const mrp = formData.get("mrp");
    const price = formData.get("price");
    const category = formData.get("category");
    const existingImagesRaw = formData.get("existingImages");
    const newImageFiles = formData.getAll("images");

    if (!name || !description || mrp == null || price == null || !category) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
    }

    let images = product.images;
    if (existingImagesRaw !== null && existingImagesRaw !== undefined && existingImagesRaw !== "") {
      try {
        images = JSON.parse(existingImagesRaw);
      } catch (_) {
        // keep current images if parse fails
      }
    }

    if (Array.isArray(newImageFiles) && newImageFiles.length > 0) {
      const uploaded = await Promise.all(
        newImageFiles.filter(Boolean).map(async (image) => {
          const buffer = Buffer.from(await image.arrayBuffer());
          const uploadResponse = await imageKit.files.upload({
            file: await toFile(buffer, image.name),
            fileName: image.name,
            folder: "products",
          });
          return imageKit.helper.buildSrc({
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
            src: uploadResponse.filePath,
            transformation: [
              { quality: "auto" },
              { format: "webp" },
              { width: "1024" },
            ],
          });
        })
      );
      images = [...(Array.isArray(images) ? images : []), ...uploaded];
    }

    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "At least one image is required" }), { status: 400 });
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        name: String(name),
        description: String(description),
        mrp: Number(mrp),
        price: Number(price),
        category: String(category),
        images,
      },
    });

    return new Response(JSON.stringify({ message: "Product updated successfully" }));
  } catch (error) {
    console.error("Error updating product:", error);
    return new Response(JSON.stringify({ error: error.message || error.code }), { status: 400 });
  }
}

// Delete a product
export async function DELETE(request, { params }) {
  try {
    const { userId } = getAuth(request);
    const storeId = await authSeller(userId);
    if (!storeId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const { productId } = await params;
    const product = await prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) {
      return new Response(JSON.stringify({ error: "Product not found" }), { status: 404 });
    }

    await prisma.product.delete({
      where: { id: productId },
    });

    return new Response(JSON.stringify({ message: "Product deleted successfully" }));
  } catch (error) {
    console.error("Error deleting product:", error);
    return new Response(JSON.stringify({ error: error.message || error.code }), { status: 400 });
  }
}
