import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { Buffer } from "buffer";
import { getSocketServer } from "@/lib/socketServer";





// Add a new product
export async function POST(request) {
  try {
    const {userId} = getAuth(request);
    const storeId = await authSeller(userId);

    if(!storeId){
        return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401});
    }

    // Get data from the form
    const formData = await request.formData();
    const name = formData.get("name");
    const description = formData.get("description");
    const mrp = Number(formData.get("mrp"));
    const price = Number(formData.get("price"));
    const warehouseQuantity = Number(formData.get("warehouseQuantity"));
    const category = formData.get("category");
    const images = formData.getAll("images");

    const missing = [];
    if (!name || String(name).trim() === "") missing.push("name");
    if (!description || String(description).trim() === "") missing.push("description");
    if (category == null || String(category).trim() === "") missing.push("category");
    if (Number.isNaN(mrp) || mrp < 0) missing.push("valid mrp (actual price)");
    if (Number.isNaN(price) || price < 0) missing.push("valid price (offer price)");
    if (!Number.isInteger(warehouseQuantity) || warehouseQuantity < 0) missing.push("valid warehouse quantity (0 or more)");
    if (!images?.length) missing.push("at least one image");

    if (missing.length) {
        return new Response(
            JSON.stringify({ error: "Missing or invalid: " + missing.join(", ") }),
            { status: 400 }
        );
    }

    // uploading images to imagekit
    const imagesUrls = await Promise.all(images.map( async (image) => {
        const buffer = Buffer.from(await image.arrayBuffer());
        const uploadResponse = await imageKit.files.upload({
            file: await toFile(buffer, image.name),
            fileName: image.name,
            folder: "products"
        });

        const optimizedImage = imageKit.helper.buildSrc({
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
            src: uploadResponse.filePath,
            transformation: [
                {quality: "auto"},
                {format: "webp"},
                {width: "1024"}
            ]
        });

        return optimizedImage;
    }));

    await prisma.product.create({
        data: {
            name,
            description,
            mrp,
            price,
            warehouseQuantity,
            category,
            images: imagesUrls,
            storeId,
            approvalStatus: "PENDING",
            approvalNotes: null,
            approvedAt: null,
            approvedBy: null
        }
    });

    try {
        const io = getSocketServer();
        io.to('admin-room').emit('admin-notification', {
            key: 'pendingProducts',
            message: 'New product submitted for approval'
        });
    } catch (socketError) {
        console.error('Socket.IO admin notify error:', socketError.message);
    }

    return new Response(JSON.stringify({message: "Product submitted for admin approval"}));
    

  } catch (error) {
    console.error("Error adding product:", error);
    return new Response(JSON.stringify({error: error.message || error.code}), {status: 400});
  }
}


// Get all products for a seller
export async function GET(request) {
    try {
        const {userId} = getAuth(request);
        const storeId = await authSeller(userId);
  
        if(!storeId){
            return new Response(JSON.stringify({error: "Unauthorized"}), {status: 401});
        }

        const products = await prisma.product.findMany({
            where: {
                storeId: storeId
            }
        });
        return NextResponse.json({ products });


    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({error: error.message || error.code}), {status: 400});
    }
}
