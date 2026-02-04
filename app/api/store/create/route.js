import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";


export async function POST(request) {
    try {
        const {userId} = getAuth(request);

        if(!userId){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const formData = await request.formData();

        const name = formData.get("name");
        const username = formData.get("username");
        const description = formData.get("description");
        const email = formData.get("email");
        const contact = formData.get("contact");
        const address = formData.get("address");
        const image = formData.get("image");

        if(!name || !username || !description || !email || !contact || !address || !image){
            return NextResponse.json({message: "Missing required fields"}, {status: 400});
        }

        // check if a user has created a store already
        const existingStore = await prisma.store.findFirst({
            where: {
                userId: userId
            }
        });

        // if a store exists send a status of the store
        if(existingStore){
            return NextResponse.json({status: existingStore.status});
        }

        // check if the username is taken
        const isUsernameTaken = await prisma.store.findFirst({
            where: {
                username: username.toLowerCase()
            }
        });

        if(isUsernameTaken){
            return NextResponse.json({error: "Username is taken"}, {status: 400});
        }

        // image upload to imagekit
        const buffer = Buffer.from( await image.arrayBuffer() );
        const uploadResponse = await imageKit.files.upload({
            file: await toFile(buffer, image.name),
            fileName: image.name,
            folder: "logos"
        });

        const optimizedImage = imageKit.helper.buildSrc({
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
            src: uploadResponse.filePath,
            transformation: [
                {quality: "auto"},
                {format: "webp"},
                {width: "512"}
            ]
        });

        // create the store (the relation to user is automatically established via userId)
        await prisma.store.create({
            data: {
                userId,
                name,
                username: username.toLowerCase(),
                description,
                email,
                contact,
                address,
                logo: optimizedImage
            }
        });

        return NextResponse.json({message: "Applied, Waiting for approval"});


    } catch (error) {
        console.error("Store creation error:", error);
        // Handle database connection errors
        if (error.message?.includes("fetch failed") || error.message?.includes("Error connecting to database") || error.code === 'ETIMEDOUT') {
            return NextResponse.json({
                error: "Database connection timeout. Your Neon database may be paused. Please check your Neon dashboard to ensure the database is active, or try again in a few moments."
            }, {status: 500});
        }
        return NextResponse.json({error: error.code || error.message}, {status: 500});
    }
}

// check if the user have already created a store, if yes send status of the store

export async function GET(request) {
    try {
        const {userId} = getAuth(request);

        if(!userId){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        // check if a user has created a store already
        const existingStore = await prisma.store.findFirst({
            where: {
                userId: userId
            }
        });
        
        // if a store exists send a status of the store
        if(existingStore){
            return NextResponse.json({status: existingStore.status});
        }

        return NextResponse.json({status: "not registered"});


    } catch (error) {
        console.error("Get store status error:", error);
        // Handle database connection errors
        if (error.message?.includes("fetch failed") || error.message?.includes("Error connecting to database") || error.code === 'ETIMEDOUT') {
            return NextResponse.json({
                error: "Database connection timeout. Your Neon database may be paused. Please check your Neon dashboard to ensure the database is active, or try again in a few moments."
            }, {status: 500});
        }
        return NextResponse.json({error: error.code || error.message}, {status: 500});
    }
}