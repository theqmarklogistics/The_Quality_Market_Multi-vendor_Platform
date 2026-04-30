import prisma from "@/lib/prisma";



const authSeller = async (userId) => {
    try {

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            include: {
                store: true
            }
        });

        if (user.store && String(user.store.status).toLowerCase() === 'approved' && user.store.isActive) {
            return user.store.id;
        }
        return false;
        
    } catch (error) {
        console.error(error);
        return false; 
    
    }
}

export default authSeller;