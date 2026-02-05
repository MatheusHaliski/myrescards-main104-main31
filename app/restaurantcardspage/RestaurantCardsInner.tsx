"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import {
    getCategoryValues,
    getCountryFlagPng,
    getFallbackImageForRestaurant,
    getNormalizedLocation,
    getStarRating,
    parseRatingValue,
    type Restaurant,
} from "@/app/gate/restaurantpagegate";

import {
    FILTER_GLOW_BAR,
    FILTER_GLOW_LINE,
    GLOW_BAR,
    GLOW_LINE,
    TEXT_GLOW,
    GLASS_INPUT,
} from "@/app/lib/uiToken";

import { SearchSelect } from "@/app/restaurantcardspage/selectelement";
import { firebaseAuthGate } from "@/app/gate/firebaseClient";
import {
    FOOD_CATEGORIES,
    getCategoryIcon,
    normalizeCategoryLabel,
} from "@/app/gate/categories";
import {
    adaptUser,
    type AuthUser,
    getUserLabel,
    getUserPhotoUrl,
} from "@/app/authview/AuthAdapter";
import {
    clearAuthSessionProfile,
    clearAuthSessionToken,
    getAuthSessionProfile,
    type AuthSessionProfile,
} from "@/app/lib/authSession";


import {getAuthSessionToken} from "@/app/lib/authSession";
/* =========================
   Data fetch (Server)
========================= */
type RestaurantBatch = {
    restaurants: Restaurant[];
    nextCursor: string | null;
};

async function fetchRestaurantsBatch(
    limit: number,
    cursor?: string | null
): Promise<RestaurantBatch> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);

    const response = await fetch(`/api/restaurants?${params.toString()}`);
    if (!response.ok) {
        throw new Error("Failed to load restaurants.");
    }
    return (await response.json()) as RestaurantBatch;
}

export function RestaurantCardsInner() {
    const router = useRouter();

    const { firebaseApp } = firebaseAuthGate();

    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState("");
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [authProfile, setAuthProfile] = useState<AuthSessionProfile>(() =>
        getAuthSessionProfile()
    );
    const [user, setUser] = useState<AuthUser | null>(null);
    const [authError, setAuthError] = useState("");

    const [cardImageUrls, setCardImageUrls] = useState<Record<string, string>>({});

    const [nameQuery, setNameQuery] = useState("");
    const [country, setCountry] = useState("");
    const [stateValue, setStateValue] = useState("");
    const [city, setCity] = useState("");
    const [category, setCategory] = useState("");
    const [starsFilter, setStarsFilter] = useState("");

    useEffect(() => {
        const t1 = getAuthSessionToken();
        if (!t1) {
            router.replace("/authview");
            return;
        }
    }, [router]);
    useEffect(() => {
        const token1 = getAuthSessionToken();
    })


    useEffect(() => {
        if (!firebaseApp) return undefined;
        const auth = getAuth(firebaseApp);
        const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
            setUser(adaptUser(nextUser));
        });
        return () => unsubscribe();
    }, [firebaseApp]);

    useEffect(() => {
        setAuthProfile(getAuthSessionProfile());
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleStorage = (event: StorageEvent) => {
            if (event.key !== "restaurantcards_auth_profile") return;
            setAuthProfile(getAuthSessionProfile());
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);



    const handleSignOut = async () => {
        if (!firebaseApp) {
            setAuthError("Firebase auth is not configured.");
            return;
        }

        try {
            clearAuthSessionProfile();
            clearAuthSessionToken();
            setAuthError("");
        } catch (signOutError) {
            console.error("[RestaurantCardsPage] sign out failed:", signOutError);
            setAuthError("Failed to sign out.");
        }
    };

    // ===========================
    // B) Load restaurants
    // ===========================
    useEffect(() => {
        let isMounted = true;

        async function loadRestaurants() {
            try {
                setLoading(true);
                setError("");

                const { restaurants: items, nextCursor: cursor } =
                    await fetchRestaurantsBatch(pageSize);
                if (!isMounted) return;
                setRestaurants(items);
                setNextCursor(cursor);
            } catch (err) {
                console.error("[RestaurantCardsPage] load failed:", err);
                if (isMounted) setError("Failed to load restaurants.");
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadRestaurants();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleLoadMore = async (): Promise<boolean> => {
        if (!nextCursor || loadingMore) return false;
        try {
            setLoadingMore(true);
            const { restaurants: items, nextCursor: cursor } =
                await fetchRestaurantsBatch(pageSize, nextCursor);
            setRestaurants((prev) => [...prev, ...items]);
            setNextCursor(cursor);
            return true;
        } catch (err) {
            console.error("[RestaurantCardsPage] load more failed:", err);
            setError("Failed to load more restaurants.");
            return false;
        } finally {
            setLoadingMore(false);
        }
    };

    const handleNextPage = async () => {
        if (currentPage < totalPages) {
            setCurrentPage((prev) => prev + 1);
            return;
        }

        if (nextCursor) {
            const didLoad = await handleLoadMore();
            if (didLoad) {
                setCurrentPage((prev) => prev + 1);
            }
        }
    };

    // ===========================
    // C) Preload imagens (se você tiver URLs)
    // ===========================
    useEffect(() => {
        if (restaurants.length === 0) {
            setCardImageUrls({});
            return;
        }

        let isMounted = true;

        const preloadImage = (url: string) =>
            new Promise<void>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve();
                img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
                img.src = url;
            });

        const loadStorageImages = async () => {
            const nextUrls: Record<string, string> = {};
            const preloadUrls: string[] = [];

            restaurants.forEach((restaurant) => {
                const candidate =
                    restaurant.photo ||
                    restaurant.imagePath ||
                    restaurant.photoPath ||
                    restaurant.storagePath ||
                    "";
                if (!candidate) return;
                nextUrls[restaurant.id] = candidate;
                preloadUrls.push(candidate);
            });

            if (!isMounted) return;
            setCardImageUrls(nextUrls);

            if (preloadUrls.length) {
                await Promise.allSettled(preloadUrls.map((url) => preloadImage(url)));
            }
        };

        loadStorageImages();
        return () => {
            isMounted = false;
        };
    }, [restaurants]);

    // ===========================
    // D) normalize location
    // ===========================
    const normalizedRestaurants = useMemo(
        () =>
            restaurants.map((restaurant) => ({
                ...restaurant,
                ...getNormalizedLocation(restaurant),
            })),
        [restaurants]
    );

    const availableCountries = useMemo(() => {
        const options = new Set<string>();
        normalizedRestaurants.forEach((r) => r.country && options.add(r.country));
        return Array.from(options).sort();
    }, [normalizedRestaurants]);

    const availableStates = useMemo(() => {
        const options = new Set<string>();
        normalizedRestaurants.forEach((r) => {
            if (country && r.country !== country) return;
            if (r.state) options.add(r.state);
        });
        return Array.from(options).sort();
    }, [normalizedRestaurants, country]);

    const availableCities = useMemo(() => {
        const options = new Set<string>();
        normalizedRestaurants.forEach((r) => {
            if (country && r.country !== country) return;
            if (stateValue && r.state !== stateValue) return;
            if (r.city) options.add(r.city);
        });
        return Array.from(options).sort();
    }, [normalizedRestaurants, country, stateValue]);

    const availableCategories = useMemo(() => {
        const seen = new Set<string>();
        const options: string[] = [];

        FOOD_CATEGORIES.forEach((c) => {
            const normalized = normalizeCategoryLabel(c);
            if (!normalized) return;
            const key = normalized.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            options.push(normalized);
        });

        return options.sort((a, b) => a.localeCompare(b));
    }, []);

    useEffect(() => {
        setStateValue("");
        setCity("");
    }, [country]);

    useEffect(() => {
        setCity("");
    }, [stateValue]);

    const filteredRestaurants = useMemo(() => {
        const normalizedQuery = nameQuery.trim().toLowerCase();
        const selectedCategory = category.trim().toLowerCase();
        const minimumStars = starsFilter ? Number(starsFilter) : null;

        return normalizedRestaurants.filter((r) => {
            const matchesName = normalizedQuery
                ? String(r.name || "").toLowerCase().includes(normalizedQuery)
                : true;

            const matchesCountry = country ? r.country === country : true;
            const matchesState = stateValue ? r.state === stateValue : true;
            const matchesCity = city ? r.city === city : true;

            const matchesCategory = selectedCategory
                ? getCategoryValues(r).some((value) => value.toLowerCase() === selectedCategory)
                : true;

            const matchesStars =
                minimumStars === null
                    ? true
                    : parseRatingValue(r.starsgiven) >= minimumStars;

            return (
                matchesName &&
                matchesCountry &&
                matchesState &&
                matchesCity &&
                matchesCategory &&
                matchesStars
            );
        });
    }, [
        normalizedRestaurants,
        nameQuery,
        country,
        stateValue,
        city,
        category,
        starsFilter,
    ]);

    useEffect(() => {
        setCurrentPage(1);
    }, [nameQuery, country, stateValue, city, category, starsFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredRestaurants.length / pageSize));

    const pagedRestaurants = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return filteredRestaurants.slice(startIndex, startIndex + pageSize);
    }, [currentPage, filteredRestaurants, pageSize]);

    const authProfileLabel = authProfile.email?.trim();
    const userLabel = authProfileLabel || getUserLabel(user, "Guest");
    const userPhoto = authProfileLabel ? "" : getUserPhotoUrl(user);

    return (
        <div className="relative min-h-screen bg-gradient-to-b bg-white text-black">
            <div className="pointer-events-none absolute inset-0 opacity-80">
                <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#22c55e]/20 blur-[140px]" />
                <div className="absolute left-1/2 top-32 h-80 w-80 -translate-x-1/2 rounded-full bg-[#38bdf8]/25 blur-[160px]" />
                <div className="absolute bottom-12 right-16 h-56 w-56 rounded-full bg-[#f97316]/20 blur-[120px]" />
            </div>

            <div className="pointer-events-none absolute inset-0">
                {/* ================= TOP / HEADER ================= */}
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-6 top-50 h-24 w-24 drop-shadow-[0_16px_30px_rgba(37,99,235,0.25)]"
                />
                <img
                    src="/losangle-orange.svg"
                    alt=""
                    className="absolute right-10 top-64 h-24 w-24 drop-shadow-[0_16px_30px_rgba(249,115,22,0.25)]"
                />

                {/* ================= MID SCROLL (PRINCIPAL) ================= */}
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-1/4 top-[35%] h-20 w-20 opacity-60 drop-shadow-[0_14px_26px_rgba(37,99,235,0.22)]"
                />
                <img
                    src="/losangle-orange.svg"
                    alt=""
                    className="absolute right-1/3 top-[42%] h-20 w-20 opacity-60 drop-shadow-[0_14px_26px_rgba(249,115,22,0.22)]"
                />

                <img
                    src="/star-gradient.svg"
                    alt=""
                    className="absolute left-[45%] top-[38%] h-16 w-16 opacity-75"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[48%] top-[48%] h-14 w-14 opacity-70"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[40%] top-[58%] h-14 w-14 opacity-70"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[53%] top-[53%] h-14 w-14 opacity-70"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[33%] top-[73%] h-14 w-14 opacity-70"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[37%] top-[50%] h-14 w-14 opacity-70"
                />
                {/* ================= DEEP MID (SURPRESA AO SCROLL) ================= */}
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-[50%] top-[50%] h-16 w-16 opacity-55"
                />
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-[60%] top-[60%] h-16 w-16 opacity-55"
                />
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-[73%] top-[40%] h-16 w-16 opacity-55"
                />
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-[10%] top-[58%] h-16 w-16 opacity-55"
                />
                <img
                    src="/losangle-orange.svg"
                    alt=""
                    className="absolute right-[12%] top-[62%] h-16 w-16 opacity-55"
                />

                <img
                    src="/star-gradient.svg"
                    alt=""
                    className="absolute left-[30%] top-[65%] h-14 w-14 opacity-65"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-[32%] top-[70%] h-14 w-14 opacity-65"
                />

                {/* ================= BOTTOM ================= */}
                <img
                    src="/losangle-blue.svg"
                    alt=""
                    className="absolute left-16 bottom-28 h-16 w-16 opacity-60"
                />
                <img
                    src="/losangle-orange.svg"
                    alt=""
                    className="absolute right-24 bottom-32 h-16 w-16 opacity-60"
                />

                <img
                    src="/star-gradient.svg"
                    alt=""
                    className="absolute left-2 bottom-20 h-14 w-14 opacity-70"
                />
                <img
                    src="/star-orange.svg"
                    alt=""
                    className="absolute right-4 bottom-14 h-10 w-10 opacity-70"
                />
            </div>


            <div className="mx-auto max-w-8xl py-6 font-sharetech text-white sm:px-6 relative z-10">
                <header
                    className={[
                        "relative flex flex-wrap items-center justify-between gap-4 px-6 py-5",
                        "rounded-3xl",
                        GLOW_BAR,
                        "border border-white/25",
                        GLOW_LINE,
                    ].join(" ")}
                >
                    <div className="pointer-events-none absolute inset-0 opacity-35 bg-gradient-to-b from-white/35 via-white/0 to-black/0" />

                    <div   className={[
                        "rounded-2xl",
                        "px-4 py-3",
                        "w-fit",
                        "bg-white",
                        "text-amber-500",
                        "border-amber-300",
                        GLOW_LINE,
                        "shadow-[0_18px_60px_rgba(0,0,0,0.25)]",
                    ].join(" ")}>
                        <div className="flex items-center gap-4">
                            <img
                                src="/COOK.jpeg"
                                alt="Velion Infyra Technology Platforms, Inc."
                                className="h-14 w-auto"
                            />
                            <div className="hidden sm:block font-sametech leading-tight">
                                <div className="text-xs font-semibold tracking-[0.22em] text-orange-600 uppercase">
                                    Friendly Eats
                                </div>
                                <div className="text-sm font-semibold text-amber-500">

                                </div>
                            </div>

                    </div>


                    </div>

                    <div className="relative z-10 min-w-[220px] text-right">
                        <div className="flex justify-end">
                            {userPhoto ? (
                                <img
                                    src={userPhoto}
                                    alt={`${userLabel} profile`}
                                    className="mb-1.5 h-9 w-9 rounded-full border border-white/60 object-cover"
                                />
                            ) : (
                                <div className="mb-1.5 text-sm text-white/90">Guest</div>
                            )}
                        </div>

                        <div className="font-semibold">{userLabel}</div>

                        {authError ? <div className="mt-1.5 text-xs text-amber-200">{authError}</div> : null}

                        <button
                            type="button"
                            onClick={() => {
                                router.replace("/authview");
                                queueMicrotask(() => handleSignOut());
                            }}
                            className="mt-2 h-11 rounded-2xl border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.25)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/35"
                        >
                            Sign out
                        </button>
                    </div>

                    <section
                        className={[
                            "relative z-10",
                            "w-full max-w-[1280px]",
                            "h-full",
                            "ml-auto",
                            "mt-3",
                            "rounded-3xl px-5 py-4",
                            FILTER_GLOW_BAR,
                            "border border-white/18",
                            FILTER_GLOW_LINE,
                        ].join(" ")}
                    >
                        <div className="grid gap-4 lg:grid-cols-[minmax(240px,350px)_1fr] items-start">
                            <div className="font-sharetech">
                                <input
                                    type="text"
                                    value={nameQuery}
                                    onChange={(event) => setNameQuery(event.target.value)}
                                    placeholder="Search by name"
                                    className={GLASS_INPUT}
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-4">
                                <div className="min-w-[180px] font-sharetech flex-1">
                                    <SearchSelect
                                        value={country}
                                        options={availableCountries}
                                        onChange={setCountry}
                                        placeholder="All countries"
                                        allLabel="All countries"
                                        includeAllOption
                                        searchPlaceholder="Search country…"
                                        getOptionLabel={(opt) => opt}
                                        renderValue={(opt) => {
                                            const flag = getCountryFlagPng(opt);
                                            return (
                                                <span className="inline-flex items-center gap-2">
                          {flag ? (
                              <img src={flag.src} alt={flag.alt} className="h-[18px] w-[18px]" />
                          ) : (
                              <span aria-hidden>🌍</span>
                          )}
                                                    <span>{opt}</span>
                        </span>
                                            );
                                        }}
                                        renderOption={(opt) => {
                                            const flag = getCountryFlagPng(opt);
                                            return (
                                                <span className="inline-flex items-center gap-2">
                          {flag ? (
                              <img
                                  src={flag.src}
                                  alt={flag.alt}
                                  className="h-[18px] w-[18px] rounded-[6px] object-cover"
                              />
                          ) : (
                              <span aria-hidden>🌍</span>
                          )}
                                                    <span>{opt}</span>
                        </span>
                                            );
                                        }}
                                    />
                                </div>

                                <div className="min-w-[200px] font-sharetech flex-1">
                                    <SearchSelect
                                        value={stateValue}
                                        options={availableStates}
                                        onChange={setStateValue}
                                        placeholder="All states"
                                        allLabel="All states"
                                        includeAllOption
                                        searchPlaceholder="Search state…"
                                        getOptionLabel={(opt) => opt}
                                        disabled={!availableStates.length}
                                    />
                                </div>

                                <div className="min-w-[200px] font-sharetech flex-1">
                                    <SearchSelect
                                        value={city}
                                        options={availableCities}
                                        onChange={setCity}
                                        placeholder="All cities"
                                        allLabel="All cities"
                                        includeAllOption
                                        searchPlaceholder="Search city…"
                                        getOptionLabel={(opt) => opt}
                                        disabled={!availableCities.length}
                                    />
                                </div>

                                <div className="min-w-[220px] font-sharetech flex-1">
                                    <SearchSelect
                                        value={category}
                                        options={availableCategories}
                                        onChange={setCategory}
                                        placeholder="All categories"
                                        allLabel="All categories"
                                        includeAllOption
                                        searchPlaceholder="Search category…"
                                        getOptionLabel={(opt) => opt}
                                        renderValue={(opt) => (
                                            <span className="inline-flex items-center gap-2">
                        <span aria-hidden>{getCategoryIcon(opt)}</span>
                        <span>{opt}</span>
                      </span>
                                        )}
                                        renderOption={(opt) => (
                                            <span className="inline-flex items-center gap-2">
                        <span aria-hidden>{getCategoryIcon(opt)}</span>
                        <span>{opt}</span>
                      </span>
                                        )}
                                    />
                                </div>

                                <div className="min-w-[200px] font-sharetech flex-1">
                                    <SearchSelect
                                        value={starsFilter}
                                        options={["1", "2", "3", "4", "5"]}
                                        onChange={setStarsFilter}
                                        placeholder="All star ratings"
                                        allLabel="All star ratings"
                                        includeAllOption
                                        searchPlaceholder="Search stars…"
                                        getOptionLabel={(opt) => `${opt}+ stars`}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>
                </header>

                <section className="mt-4 m-3.5 min-w-2xl">
                    {!loading && error ? (
                        <p className="whitespace-pre-wrap rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 backdrop-blur-2xl">
                            {error}
                        </p>
                    ) : null}

                    {!loading && !error && filteredRestaurants.length === 0 ? (
                        <p className="rounded-2xl border border-white/14 bg-white/[0.08] px-4 py-3 text-sm text-white/70 backdrop-blur-2xl">
                            No restaurants match your filters.
                        </p>
                    ) : null}

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-8 justify-items-center">
                        {pagedRestaurants.map((restaurant) => {
                            const ratingValueRaw =
                                restaurant.starsgiven ?? restaurant.rating ?? restaurant.grade ?? 0;

                            const { rounded, display } = getStarRating(ratingValueRaw);
                            const fallbackImage = getFallbackImageForRestaurant(restaurant);

                            const cardImageSrc =
                                restaurant.photo ||
                                restaurant.imagePath ||
                                restaurant.photoPath ||
                                restaurant.storagePath ||
                                cardImageUrls[restaurant.id] ||
                                fallbackImage;

                            return (
                                <Link
                                    key={restaurant.id}
                                    href={`/restaurantinfopage/${restaurant.id}`}
                                    className="text-inherit no-underline"
                                >
                                    <article
                                        className={[
                                            "group relative rounded-3xl",
                                            "border-yellow-200",
                                            "rounded-2xl",
                                            "border-4",
                                            "shadow-[0_0_0_1px_rgba(249,115,22,0.55),0_18px_60px_rgba(249,115,22,0.45)]",

                                            // 🌈 FUNDO IGUAL AO FILTRO
                                            GLOW_BAR,

                                            "transition duration-200",
                                            "min-h-[300px]",
                                            "w-full max-w-[320px]",
                                        ].join(" ")}
                                    >
                                        {/* brilho sutil superior */}
                                        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-[linear-gradient(to_bottom,rgba(255,255,255,0.18),rgba(255,255,255,0)_45%)]" />

                                        {cardImageSrc ? (
                                            <div className="relative">
                                                <img
                                                    src={cardImageSrc}
                                                    alt={restaurant.name || "Restaurant"}
                                                    loading="lazy"
                                                    decoding="async"
                                                    className="block h-40 w-full object-cover rounded-t-3xl opacity-95"
                                                />
                                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-black/0 to-black/0" />
                                            </div>
                                        ) : (
                                            <div aria-hidden className="h-40 w-full rounded-t-3xl bg-white/5" />
                                        )}

                                        {/* ⬇️ INNER DIV — BRANCA, TEXTO PRETO, BORDA PRETA */}
                                        <div className="relative p-4">
                                            <div className="rounded-2xl border-4 border-yellow-200 bg-white px-4 py-3 text-center shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
                                                <h3 className="text-lg font-semibold leading-tight text-black">
                                                    {restaurant.name || "Unnamed Restaurant"}
                                                </h3>

                                                <span
                                                    aria-label={`Restaurant rating ${display.toFixed(1)} out of 5`}
                                                    className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-black"
                                                >
        <span className="inline-flex gap-0.5 text-base">
          {Array.from({ length: 5 }, (_, index) => (
              <span
                  key={`star-${restaurant.id}-${index}`}
                  className={index < rounded ? "text-amber-400" : "text-black/20"}
              >
              ★
            </span>
          ))}
        </span>
        <span className="text-xs text-black/70">
          {display.toFixed(1)}
        </span>
      </span>

                                                <div className="my-3 h-px w-full bg-black/15" />

                                                <p className="text-sm text-black">
                                                    {[restaurant.address, restaurant.street, restaurant.city, restaurant.state]
                                                        .filter(Boolean)
                                                        .join(", ") || "Address unavailable."}
                                                </p>

                                                <div className="mt-2 text-xs text-black/70">
                                                    <div>
                                                        {restaurant.city || "Unknown city"}
                                                        {restaurant.state ? `, ${restaurant.state}` : ""}
                                                    </div>

                                                    <div className="mt-1 inline-flex items-center gap-2">
                                                        {restaurant.country ? (
                                                            (() => {
                                                                const flag = getCountryFlagPng(restaurant.country);
                                                                return (
                                                                    <>
                                                                        {flag ? (
                                                                            <img
                                                                                src={flag.src}
                                                                                alt={flag.alt}
                                                                                className="h-[18px] w-[18px]"
                                                                            />
                                                                        ) : (
                                                                            <span aria-hidden>🌍</span>
                                                                        )}
                                                                        <span>{restaurant.country}</span>
                                                                    </>
                                                                );
                                                            })()
                                                        ) : (
                                                            <>
                                                                <span aria-hidden>🌍</span>
                                                                <span>Unknown country</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </article>

                                </Link>
                            );
                        })}
                    </div>

                    {!loading && !error && filteredRestaurants.length > 0 ? (
                        <div    className={[
                            "relative flex flex-wrap items-center justify-between gap-4 px-6 py-5",
                            "rounded-3xl",
                            GLOW_BAR,
                            "bg-emerald-500/20",
                            "border border-emerald-400",
                            GLOW_LINE,
                        ].join(" ")}>
                            <div>
                                Showing{" "}
                                <span className="font-semibold text-white">
                  {(currentPage - 1) * pageSize + 1}
                </span>{" "}
                                -{" "}
                                <span className="font-semibold text-white">
                  {Math.min(currentPage * pageSize, filteredRestaurants.length)}
                </span>{" "}
                                of{" "}
                                <span className="font-semibold text-white">
                  {filteredRestaurants.length}
                </span>{" "}
                                restaurants
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="h-10 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Previous
                                </button>

                                <span className="text-xs text-white/70">
                  Page{" "}
                                    <span className="font-semibold text-white">{currentPage}</span> of{" "}
                                    <span className="font-semibold text-white">{totalPages}</span>
                </span>

                                <button
                                    type="button"
                                    onClick={handleNextPage}
                                    disabled={loadingMore || (!nextCursor && currentPage === totalPages)}
                                    className="h-10 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {loadingMore ? "Loading…" : "Next"}
                                </button>
                            </div>
                        </div>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
