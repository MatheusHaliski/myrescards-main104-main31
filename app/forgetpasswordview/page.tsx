"use client";

import AuthShell from "../components/AuthShell";
import { Button } from "@/components/ui/button";
import {router} from "next/client";

export default function SignupViewPage() {
    return (
        <AuthShell
            title="Password reset"
            subtitle="Send yourself a reset link"
            description="Enter the email connected to your Social Media account. We will send a secure link to redefine your password."
        >

            <div className="flex flex-col bg-yellow-100 border-8 rounded-2xl border-orange-400 items-center gap-4 pt-8">
            <form className="space-y-8 text-base mt-10">
                <label className="block text-xl font-semibold text-orange-600 leading-tight">
                    Email address
                    <input
                        type="email"
                        placeholder=""
                        className="mt-2 w-full rounded-xl border border-[#0b2b45]/25 bg-white/30 px-4 py-3 text-lg text-[#1d4ed8] shadow-sm focus:border-[#facc15] focus:outline-none focus:ring-2 focus:ring-[#facc15]/40"
                    />
                </label>

                <div className="mt-10 flex w-full flex-col items-center gap-6">
                    <Button
                        type="submit"
                        className="inline-flex w-full max-w-xs items-center justify-center scale-110 text-xs font-semibold uppercase tracking-[0.2em] text-white transition rounded-full"
                    >
                        Email the reset link
                    </Button>

                    <Button
                        onClick={() =>  router.replace("/authview")}
                        className="inline-flex w-full max-w-xs items-center justify-center scale-110 text-xs font-semibold uppercase tracking-[0.2em] text-white transition rounded-full"
                    >
                        Return
                    </Button>

                    <Button
                        onClick={() =>  router.replace("/signupview")}
                        className="inline-flex w-full max-w-xs items-center justify-center scale-110 text-xs font-semibold uppercase tracking-[0.2em] text-white transition rounded-full"
                    >
                        Create an account
                    </Button>
                </div>

            </form>
            </div>
        </AuthShell>
    );
}







