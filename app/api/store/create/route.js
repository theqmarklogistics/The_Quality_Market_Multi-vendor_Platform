import { getAuth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import imageKit, { toFile } from "@/configs/imageKit";
import { getSocketServer } from "@/lib/socketServer";


export async function POST(request) {
    try {
        const {userId} = getAuth(request);

        if(!userId){
            return NextResponse.json({error: "Unauthorized"}, {status: 401});
        }

        const formData = await request.formData();

        const name = String(formData.get("name") || "").trim();
        const username = String(formData.get("username") || "").trim();
        const description = String(formData.get("description") || "").trim();
        const email = String(formData.get("email") || "").trim();
        const contact = String(formData.get("contact") || "").trim();
        const address = String(formData.get("address") || "").trim();
        const image = formData.get("image");
        const tinNumber = String(formData.get("tinNumber") || "").trim();
        const sellerModel = String(formData.get("sellerModel") || "LOCAL_SELLER").trim();
        const idPhoto = formData.get("idPhoto");
        const rdbCertificate = formData.get("rdbCertificate");

        if (!['FULL_MANAGED', 'LOCAL_SELLER'].includes(sellerModel)) {
            return NextResponse.json({ error: "Invalid seller model" }, { status: 400 });
        }

        const missingFields = [];
        if (!name) missingFields.push("name");
        if (!username) missingFields.push("username");
        if (!description) missingFields.push("description");
        if (!email) missingFields.push("email");
        if (!contact) missingFields.push("contact");
        if (!address) missingFields.push("address");
        if (!tinNumber) missingFields.push("tinNumber");
        if (!image || typeof image.arrayBuffer !== "function") missingFields.push("image");
        if (!idPhoto || typeof idPhoto.arrayBuffer !== "function") missingFields.push("idPhoto");

        if (missingFields.length > 0) {
            return NextResponse.json({
                error: "Missing required fields",
                fields: missingFields
            }, { status: 400 });
        }

        if (!/^[A-Za-z0-9-]{6,30}$/.test(String(tinNumber))) {
            return NextResponse.json({ error: "Invalid TIN format" }, { status: 400 });
        }

        // check if a user has created a store already
        const existingStore = await prisma.store.findFirst({
            where: {
                userId: userId
            }
        });

        // if a store exists send a status of the store
        if(existingStore){
            return NextResponse.json({status: existingStore.status, message: "Store record already exists"});
        }

        // check if the username is taken
        const isUsernameTaken = await prisma.store.findFirst({
            where: {
                username: username.toLowerCase()
            }
        });

        if(isUsernameTaken){
            return NextResponse.json({error: "Username is taken"}, {status: 409});
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

        const idBuffer = Buffer.from( await idPhoto.arrayBuffer() );
        const idUpload = await imageKit.files.upload({
            file: await toFile(idBuffer, idPhoto.name),
            fileName: idPhoto.name,
            folder: "store-compliance/id-photo"
        });

        let rdbCertificateUrl = null;
        if (rdbCertificate) {
            const certBuffer = Buffer.from(await rdbCertificate.arrayBuffer());
            const certUpload = await imageKit.files.upload({
                file: await toFile(certBuffer, rdbCertificate.name),
                fileName: rdbCertificate.name,
                folder: "store-compliance/rdb-certificate"
            });
            rdbCertificateUrl = certUpload.url;
        }

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
                logo: optimizedImage,
                tinNumber: String(tinNumber),
                sellerModel,
                idPhotoUrl: idUpload.url,
                rdbCertificateUrl
            }
        });

        try {
            const io = getSocketServer();
            io.to('admin-room').emit('admin-notification', {
                key: 'pendingStores',
                message: 'New store submitted for approval'
            });
        } catch (socketError) {
            console.error('Socket.IO admin notify error:', socketError.message);
        }

        return NextResponse.json({message: "Applied, Waiting for approval"});


    } catch (error) {
        console.error("Store creation error:", error);
        // Handle database connection errors
        if (error.message?.includes("fetch failed") || error.message?.includes("Error connecting to database") || error.code === 'ETIMEDOUT') {
            return NextResponse.json({
                error: "Database connection timeout. Your Supabase database may be paused. Please check your Supabase dashboard to ensure the database is active, or try again in a few moments."
            }, {status: 500});
        }
        if (error.code === "P2002") {
            return NextResponse.json({ error: "Store username or user already exists" }, { status: 409 });
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
                error: "Database connection timeout. Your Supabase database may be paused. Please check your Supabase dashboard to ensure the database is active, or try again in a few moments."
            }, {status: 500});
        }
        return NextResponse.json({error: error.code || error.message}, {status: 500});
    }
}