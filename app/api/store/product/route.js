import authSeller from "@/middlewares/authSeller";
import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { Buffer } from "buffer";





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
    const category = formData.get("category");
    const images = formData.getAll("images");

    if(!name || !description || !mrp || !price || !category || images.length === 0){
        return new Response(JSON.stringify({error: "Missing required fields"}), {status: 400});
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
            category,
            images: imagesUrls,
            storeId
        }
    });

    return new Response(JSON.stringify({message: "Product added successfully"}));
    

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
