import { NextResponse } from "next/server";

import { getAdminFirestore } from "@/app/lib/firebaseAdmin";
import type { Restaurant } from "@/app/gate/restaurantpagegate";

export async function GET() {
    try {
        const db = getAdminFirestore();
        const snapshot = await db.collection("restaurants").get();
        const restaurants = snapshot.docs.map((doc) => ({
            ...(doc.data() as Restaurant),
            id: doc.id,
        }));
        return NextResponse.json(restaurants);
    } catch (error) {
        console.error("[Restaurants API] load failed:", error);
        return NextResponse.json(
            { error: "Unable to load restaurants." },
            { status: 500 }
        );
    }
}