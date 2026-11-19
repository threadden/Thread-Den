import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  X,
  Camera,
  Upload,
  RefreshCw,
  Check,
  ShoppingBag,
  Eye,
  Send,
  Download,
  ArrowRight,
  Flame,
  Info,
  Maximize2,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Product, CustomerMiniature, StylistFitVerdict } from "../types";
import { getProductColorImage, getProductBackImage } from "../data";

const chibiMaleImg = "/assets/images/chibi_mini_male_1794196203534.jpg";
const chibiFemImg = "/assets/images/chibi_mini_fem_1794196204634.jpg";
const chibiUrbanImg = "/assets/images/chibi_mini_urban_1794196205330.jpg";
const chibiSareeImg = "/assets/images/chibi_mini_saree_1794637741280.jpg";
const chibiChudidharImg = "/assets/images/chibi_mini_chudidhar_1794637742242.jpg";
const chibiWomenWesternImg = "/assets/images/chibi_mini_women_western_1794637743041.jpg";
const CHIBI_REFERENCE_IMG = "/assets/aistudio/image_aa6d36c7.png";

type AttireType = "western_tee" | "western_shirt" | "saree" | "chudidhar";

function detectGarmentKind(category?: string, productName?: string): "saree" | "chudidhar" | "shirt" | "polo" | "tee" {
  const hay = `${category || ""} ${productName || ""}`.toLowerCase();
  if (/\bsaree\b|\bsarees\b|\bsari\b|\bkanchipuram\b|\bbanarasis?\b|\bpatola\b|\borganza\b/.test(hay)) return "saree";
  if (/\bchididhar|\bchudidhar|\bchuridar|\bsalwar|\banarkali|\bkurti|\bkurta\b|\bethnic set\b/.test(hay)) return "chudidhar";
  if (/\bpolo\b/.test(hay)) return "polo";
  if (/\bshirt\b|\bshirts\b|\bbutton-down\b|\boxford\b|\blinen shirt\b|\bwestern shirt\b/.test(hay) && !/\bt-?shirt|\btees?\b/.test(hay)) {
    return "shirt";
  }
  return "tee";
}

interface AiStylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  selectedProduct: Product | null;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (
    product: Product,
    size: string,
    color: { name: string; hex: string },
    quantity: number
  ) => void;
  theme: "dark" | "light";
  currencySymbol: string;
  brandName?: string;
  initialColor?: { name: string; hex: string };
  initialView?: "front" | "back";
}

// 3D Collectible Chibi Miniature Personas (sample models for Men & Women)
const PRESET_MODELS: {
  id: string;
  name: string;
  subtitle: string;
  genderGroup: "women" | "men";
  attire: AttireType;
  photo: string;
  style: "streetwear_vinyl" | "anime_chibi" | "realistic_scale";
  build: "regular" | "athletic" | "oversized_loose";
  skinTone: string;
  hairStyle: string;
  hairColor: string;
  facialVibe: string;
  notes: string;
}[] = [
  {
    id: "preset_chibi_ananya_saree",
    name: "Ananya (Saree)",
    subtitle: "Traditional Drape",
    genderGroup: "women",
    attire: "saree",
    photo: chibiSareeImg,
    style: "anime_chibi",
    build: "regular",
    skinTone: "warm ivory",
    hairStyle: "long wavy brunette",
    hairColor: "#3b261d",
    facialVibe: "warm graceful smile",
    notes: "Collectible miniature sculpted in a classic pleated silk saree with bordered pallu.",
  },
  {
    id: "preset_chibi_meera_chudidhar",
    name: "Meera (Chudidhar)",
    subtitle: "Kurta & Dupatta",
    genderGroup: "women",
    attire: "chudidhar",
    photo: chibiChudidharImg,
    style: "anime_chibi",
    build: "regular",
    skinTone: "golden caramel",
    hairStyle: "long raven half-up",
    hairColor: "#1b1c20",
    facialVibe: "bright festive smile",
    notes: "Collectible miniature wearing an embroidered kurta, churidar bottoms, and draped dupatta.",
  },
  {
    id: "preset_chibi_riya_shirt",
    name: "Riya (Western)",
    subtitle: "Button-Down Shirt",
    genderGroup: "women",
    attire: "western_shirt",
    photo: chibiWomenWesternImg,
    style: "realistic_scale",
    build: "regular",
    skinTone: "warm wheatish",
    hairStyle: "shoulder-length waves",
    hairColor: "#422b1f",
    facialVibe: "confident smile",
    notes: "Collectible miniature tailored in a crisp western button-down shirt and straight denim.",
  },
  {
    id: "preset_chibi_hana",
    name: "Hana (Women's Tee)",
    subtitle: "Western Tee",
    genderGroup: "women",
    attire: "western_tee",
    photo: chibiFemImg,
    style: "anime_chibi",
    build: "regular",
    skinTone: "porcelain fair",
    hairStyle: "curtain bangs bob",
    hairColor: "#2c221e",
    facialVibe: "sweet cheerful grin",
    notes: "Curtain bangs with relaxed western tee drape and everyday streetwear balance.",
  },
  {
    id: "preset_chibi_kai",
    name: "Kai (Men's Tee)",
    subtitle: "Western Tee",
    genderGroup: "men",
    attire: "western_tee",
    photo: chibiMaleImg,
    style: "anime_chibi",
    build: "regular",
    skinTone: "warm ivory",
    hairStyle: "sculpted brown side-part",
    hairColor: "#543825",
    facialVibe: "cheerful closed-eye smile",
    notes: "Charming smile and molded brown hair, great for men's western tees and casual shirts.",
  },
  {
    id: "preset_chibi_kenzo",
    name: "Kenzo (Men's Urban)",
    subtitle: "Boxy Shirt & Tee",
    genderGroup: "men",
    attire: "western_shirt",
    photo: chibiUrbanImg,
    style: "streetwear_vinyl",
    build: "oversized_loose",
    skinTone: "warm medium",
    hairStyle: "fade cut with beanie",
    hairColor: "#1a1a1a",
    facialVibe: "confident street vibe",
    notes: "Textured fade hair with beanie, oversized western shirt & tee proportions.",
  },
  {
    id: "preset_chibi_suit",
    name: "Classic Chibi",
    subtitle: "Original Figure",
    genderGroup: "men",
    attire: "western_tee",
    photo: CHIBI_REFERENCE_IMG,
    style: "anime_chibi",
    build: "regular",
    skinTone: "fair ivory",
    hairStyle: "sculpted side-part hair",
    hairColor: "#4e311f",
    facialVibe: "gentle closed-eye smile",
    notes: "Classic collectible miniature doll reference with smooth matte vinyl resin finish.",
  },
];

/**
 * Downscale and compress image client-side to ensure compact payload size (<50KB)
 * Prevents localStorage QuotaExceededError and HTTP 413 PayloadTooLargeError
 */
const compressImage = (dataUrl: string, maxDim = 640, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      return resolve(dataUrl);
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

/** The figurine image to dress: an AI-generated miniature, or a preset doll photo. Null = use CSS doll fallback. */
const getFigureImage = (mini: CustomerMiniature | null): string | null => {
  if (!mini || !mini.miniatureImageUrl) return null;
  return mini.miniatureImageUrl;
};

// Try-on results are cached per miniature + product + colour + size so switching back is instant.
const TRYON_CACHE_KEY = "thread_den_tryon_cache_v1";
const TRYON_CACHE_LIMIT = 8;
type TryOnCache = { key: string; url: string }[];

const loadTryOnCache = (): TryOnCache => {
  try {
    const raw = localStorage.getItem(TRYON_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveTryOnCache = (cache: TryOnCache) => {
  // Drop oldest entries until it fits in storage
  for (let n = cache.length; n >= 0; n--) {
    try {
      localStorage.setItem(TRYON_CACHE_KEY, JSON.stringify(cache.slice(-n)));
      return;
    } catch {
      /* quota protection – try fewer */
    }
  }
};

const TRYON_STEPS = [
  "Reading garment cut & print…",
  "Fitting onto your miniature…",
  "Draping fabric & matching lighting…",
  "Finishing details…",
];

export default function AiStylistModal({
  isOpen,
  onClose,
  products,
  selectedProduct,
  onSelectProduct,
  onAddToCart,
  theme,
  currencySymbol,
  brandName = "THREAD DEN",
  initialColor,
  initialView = "front",
}: AiStylistModalProps) {
  // Active product being tried on
  const activeProduct = selectedProduct || (products.length > 0 ? products[0] : null);

  // Garment styling controls
  const [selectedColor, setSelectedColor] = useState<{ name: string; hex: string }>(() => {
    if (initialColor && initialColor.name) return initialColor;
    if (activeProduct && activeProduct.colors && activeProduct.colors.length > 0) {
      return activeProduct.colors[0];
    }
    return { name: "Vintage Black", hex: "#18181b" };
  });

  const [selectedSize, setSelectedSize] = useState<string>(() => {
    if (activeProduct && activeProduct.sizes && activeProduct.sizes.length > 0) {
      return activeProduct.sizes[1] || activeProduct.sizes[0];
    }
    return "L";
  });

  const [garmentView, setGarmentView] = useState<"front" | "back">(initialView);

  // Keep color, size, and front/back view synchronized when activeProduct changes
  useEffect(() => {
    if (activeProduct) {
      if (initialColor && activeProduct.colors.some((c) => c.name === initialColor.name)) {
        setSelectedColor(initialColor);
      } else if (activeProduct.colors.length > 0) {
        setSelectedColor(activeProduct.colors[0]);
      }
      if (activeProduct.sizes.length > 0) {
        setSelectedSize(activeProduct.sizes[1] || activeProduct.sizes[0]);
      }
      setGarmentView(initialView || "front");
    }
  }, [activeProduct?.id, initialColor, initialView]);

  // Customer Miniature persistence state
  const [miniature, setMiniature] = useState<CustomerMiniature | null>(() => {
    try {
      const saved = localStorage.getItem("thread_den_customer_miniature");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not read miniature from storage:", e);
    }
    return null;
  });

  // Save miniature changes to localStorage safely with quota protection
  useEffect(() => {
    if (miniature) {
      try {
        localStorage.setItem("thread_den_customer_miniature", JSON.stringify(miniature));
      } catch (storageErr) {
        console.warn("Storage quota exceeded, attempting to store lightweight miniature:", storageErr);
        try {
          const lightweight: CustomerMiniature = {
            ...miniature,
            userPhotoUrl: miniature.userPhotoUrl?.startsWith("data:")
              ? ""
              : miniature.userPhotoUrl,
            miniatureImageUrl: miniature.miniatureImageUrl?.startsWith("data:")
              ? ""
              : miniature.miniatureImageUrl,
          };
          localStorage.setItem("thread_den_customer_miniature", JSON.stringify(lightweight));
        } catch (innerErr) {
          console.warn("Storage unavailable, skipping localStorage persistence:", innerErr);
        }
      }
    }
  }, [miniature]);

  // View state: "fitting_room" (miniature preview) vs "create_miniature" (photo upload/snapshot)
  const [viewMode, setViewMode] = useState<"fitting_room" | "create_miniature">("fitting_room");

  // Onboarding creation state
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("Style Explorer");
  const [selectedStyle, setSelectedStyle] = useState<"streetwear_vinyl" | "anime_chibi" | "realistic_scale">("streetwear_vinyl");
  const [selectedBuild, setSelectedBuild] = useState<"regular" | "athletic" | "oversized_loose">("regular");
  const [selectedAttire, setSelectedAttire] = useState<AttireType>(() => {
    const kind = detectGarmentKind(activeProduct?.category, activeProduct?.name);
    return kind === "saree" ? "saree" : kind === "chudidhar" ? "chudidhar" : kind === "shirt" ? "western_shirt" : "western_tee";
  });
  const [presetFilter, setPresetFilter] = useState<"all" | "women" | "men">("all");
  const [failedPresetIds, setFailedPresetIds] = useState<Record<string, boolean>>({});
  const [isGeneratingMiniature, setIsGeneratingMiniature] = useState<boolean>(false);
  const [creationStepIndex, setCreationStepIndex] = useState<number>(0);
  const [creationError, setCreationError] = useState<string>("");

  // Camera capture state
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const creationStepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Zoom and cart feedback
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);

  // AI Fit Verdict state
  const [verdict, setVerdict] = useState<StylistFitVerdict | null>(null);
  const [isAnalyzingFit, setIsAnalyzingFit] = useState<boolean>(false);

  // Real AI miniature + try-on state
  const [generationNotice, setGenerationNotice] = useState<string>("");
  const [tryOnCache, setTryOnCache] = useState<TryOnCache>(() => loadTryOnCache());
  const [isTryingOn, setIsTryingOn] = useState<boolean>(false);
  const [tryOnStepIndex, setTryOnStepIndex] = useState<number>(0);
  const [tryOnError, setTryOnError] = useState<string>("");
  const [showBaseFigure, setShowBaseFigure] = useState<boolean>(false);
  const [tryOnNonce, setTryOnNonce] = useState<number>(0); // bump to force regeneration
  const tryOnRequestRef = useRef<number>(0);

  const figureImage = getFigureImage(miniature);
  const frontProductPhoto = activeProduct ? getProductColorImage(activeProduct, selectedColor.name) || activeProduct.images?.[0] || "" : "";
  const backProductPhoto = activeProduct ? getProductBackImage(activeProduct, selectedColor.name) : "";
  const hasBackProductPhoto = Boolean(backProductPhoto && backProductPhoto !== frontProductPhoto);
  const activeGarmentSide: "front" | "back" = garmentView === "back" && hasBackProductPhoto ? "back" : "front";
  const tryOnKey =
    miniature && activeProduct
      ? `${miniature.id}|${activeProduct.id}|${selectedColor.name}|${selectedSize}|${activeGarmentSide}`
      : "";
  const dressedImage = tryOnCache.find((c) => c.key === tryOnKey)?.url || "";

  // Mini AI stylist chat query state
  const [stylistQuestion, setStylistQuestion] = useState("");
  const [stylistAnswer, setStylistAnswer] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);

  // Reset or switch view when modal opens, and stop camera/timers on close or unmount
  useEffect(() => {
    if (isOpen) {
      if (!miniature) {
        setViewMode("create_miniature");
      } else {
        setViewMode("fitting_room");
      }
      setAddedSuccess(false);
      setStylistAnswer("");
    } else {
      handleStopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, miniature]);

  useEffect(() => {
    return () => {
      if (creationStepIntervalRef.current) {
        clearInterval(creationStepIntervalRef.current);
        creationStepIntervalRef.current = null;
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  // Dress the miniature (AI try-on) whenever product / colour / size changes.
  // Debounced 600ms so rapid clicks don't fire multiple parallel generations.
  useEffect(() => {
    if (!isOpen || viewMode !== "fitting_room" || !miniature || !activeProduct) return;
    setShowBaseFigure(false);
    setTryOnError("");

    // No figurine to dress (AI unavailable) -> text-only verdict on the CSS doll
    if (!figureImage) {
      setIsTryingOn(false);
      fetchFitAnalysis();
      return;
    }

    // Cached look -> just refresh the verdict
    const cached = tryOnCache.find((c) => c.key === tryOnKey)?.url;
    if (cached && tryOnNonce === 0) {
      setIsTryingOn(false);
      fetchFitAnalysis(cached);
      return;
    }

    const requestId = ++tryOnRequestRef.current;
    setIsTryingOn(true);
    setTryOnStepIndex(0);
    const stepTimer = setInterval(() => setTryOnStepIndex((i) => Math.min(i + 1, TRYON_STEPS.length - 1)), 2500);

    const debounce = setTimeout(async () => {
      try {
        let productImage =
          activeGarmentSide === "back"
            ? backProductPhoto
            : frontProductPhoto;
        if (productImage.startsWith("data:image")) productImage = await compressImage(productImage, 640, 0.85);

        const res = await fetch("/api/stylist/try-on", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            miniatureImage: figureImage,
            productImage,
            garmentView: activeGarmentSide,
            product: {
              name: activeProduct.name,
              category: activeProduct.category,
              description: activeProduct.description,
              sizes: activeProduct.sizes,
              colors: activeProduct.colors.map((c) => ({ name: c.name, hex: c.hex })),
            },
            color: selectedColor,
            size: selectedSize,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (requestId !== tryOnRequestRef.current) return; // a newer selection superseded this one
        if (!res.ok && !data.isFallback) throw new Error(data.error || "The try-on preview could not be generated.");

        if (data.imageUrl) {
          const compact = await compressImage(data.imageUrl, 640, 0.85);
          if (requestId !== tryOnRequestRef.current) return;

          setTryOnCache((prev) => {
            const next = [...prev.filter((c) => c.key !== tryOnKey), { key: tryOnKey, url: compact }].slice(-TRYON_CACHE_LIMIT);
            saveTryOnCache(next);
            return next;
          });
          setTryOnNonce(0);
          fetchFitAnalysis(compact);
        } else {
          // Image model unavailable or fallback mode: proceed with AI fit verdict
          setTryOnNonce(0);
          fetchFitAnalysis();
        }
      } catch (err: any) {
        if (requestId !== tryOnRequestRef.current) return;
        setTryOnError(err?.message || "The try-on preview could not be generated.");
        setTryOnNonce(0);
        fetchFitAnalysis();
      } finally {
        if (requestId === tryOnRequestRef.current) {
          setIsTryingOn(false);
          clearInterval(stepTimer);
        }
      }
    }, 600);

    return () => {
      clearTimeout(debounce);
      clearInterval(stepTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOnKey, figureImage, viewMode, isOpen, tryOnNonce]);

  const fetchFitAnalysis = async (tryOnImage?: string) => {
    if (!activeProduct || !miniature) return;
    setIsAnalyzingFit(true);
    try {
      const res = await fetch("/api/stylist/analyze-fit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: activeProduct,
          selectedColor: selectedColor.name,
          selectedSize,
          miniature: {
            name: miniature.name,
            build: miniature.build,
            style: miniature.style,
            skinTone: miniature.skinTone,
            hairStyle: miniature.hairStyle,
            hairColor: miniature.hairColor,
          },
          tryOnImage,
        }),
      });
      const data = await res.json();
      if (data.verdict) {
        setVerdict(data.verdict);
      }
    } catch {
      // Fallback verdict (offline / server unreachable)
      const kind = detectGarmentKind(activeProduct.category, activeProduct.name);
      setVerdict(
        kind === "saree"
          ? {
              isEstimate: true,
              basedOnPreview: false,
              fitScore: 86,
              matchLevel: "Graceful Heritage Drape",
              silhouetteDrape: "Flowing pleats and bordered pallu create an elongated, balanced silhouette.",
              colorSynergy: `${selectedColor.name} pairs radiantly with ${miniature.skinTone || "natural"} tones.`,
              stylistAdvice: `"${activeProduct.name}" frames your miniature gracefully. Pair with a structured matching blouse and ethnic sandals.`,
              recommendedPairings: {
                bottoms: "Matching petticoat underskirt for neat ankle pleats.",
                footwear: "Kitten-heel ethnic sandals or kolhapuris.",
                accessories: "Gold jhumkas, bangles, and a classic potli bag.",
              },
            }
          : kind === "chudidhar"
          ? {
              isEstimate: true,
              basedOnPreview: false,
              fitScore: 85,
              matchLevel: "Refined Chudidhar Fit",
              silhouetteDrape: `Tailored kurta line with tapered churidar gathers and sheer dupatta drape in size ${selectedSize}.`,
              colorSynergy: `${selectedColor.name} harmonizes smoothly with ${miniature.skinTone || "natural"} complexions.`,
              stylistAdvice: `Size ${selectedSize} on "${activeProduct.name}" gives clean shoulder alignment without pulling. Keep the dupatta pleated or draped lightly.`,
              recommendedPairings: {
                bottoms: "Matching fitted churidar trousers with ankle gathers.",
                footwear: "Embroidered ethnic mojaris or metallic flats.",
                accessories: "Oxidized silver earrings and a subtle clutch.",
              },
            }
          : kind === "shirt"
          ? {
              isEstimate: true,
              basedOnPreview: false,
              fitScore: 84,
              matchLevel: "Crisp Western Shirt Tailoring",
              silhouetteDrape: `Structured button-down placket and collar hold clean shape in size ${selectedSize}.`,
              colorSynergy: `${selectedColor.name} creates sharp contrast with ${miniature.skinTone || "natural"} tones.`,
              stylistAdvice: `Wear "${activeProduct.name}" neatly tucked or with rolled cuffs. Size ${selectedSize} balances shoulder structure and waist room.`,
              recommendedPairings: {
                bottoms: "Straight-cut indigo denim or tailored chinos.",
                footwear: "Clean leather sneakers or minimal loafers.",
                accessories: "Classic analog watch and slim leather belt.",
              },
            }
          : {
              isEstimate: true,
              basedOnPreview: false,
              fitScore: 82,
              matchLevel: "Solid Western Tee Drape",
              silhouetteDrape: `Combed cotton jersey with clean collar ribbing in size ${selectedSize}.`,
              colorSynergy: `${selectedColor.name} pairs cleanly with ${miniature.skinTone || "natural"} tones.`,
              stylistAdvice: `The relaxed cut on "${activeProduct.name}" gives your miniature a balanced posture. Size ${selectedSize} delivers comfortable shoulder room.`,
              recommendedPairings: {
                bottoms: "Wide-leg washed denim or straight utility trousers.",
                footwear: "Retro runners or low-top skate classics.",
                accessories: "Minimalist chain and compact crossbody bag.",
              },
            }
      );
    } finally {
      setIsAnalyzingFit(false);
    }
  };

  // Handle Photo File Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        setCreationError("Please upload a photo under 15MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawDataUrl = reader.result as string;
          // Downscale and compress to max 640px JPEG (~40KB)
          const compressed = await compressImage(rawDataUrl, 640, 0.8);
          setUploadedPhotoUrl(compressed);
          setCreationError("");
        } catch {
          setUploadedPhotoUrl(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Start Camera
  const handleStartCamera = async () => {
    try {
      setCreationError("");
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setIsCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      setCreationError("Camera access was not granted. Please select a photo or choose a preset model below.");
      setIsCameraActive(false);
    }
  };

  // Snap photo from Camera with max 640px downscale and 0.8 JPEG compression
  const handleCapturePhoto = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 640;
      const maxDim = 640;
      let width = vWidth;
      let height = vHeight;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setUploadedPhotoUrl(dataUrl);
        handleStopCamera();
      }
    }
  };

  const handleStopCamera = () => {
    const activeStream = cameraStreamRef.current || cameraStream;
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Select Preset Model
  const handleSelectPresetModel = (preset: typeof PRESET_MODELS[0]) => {
    setUploadedPhotoUrl(preset.photo);
    setCustomerName(preset.name.split(" ")[0]);
    setSelectedStyle(preset.style);
    setSelectedBuild(preset.build);
    setSelectedAttire(preset.attire);
    setCreationError("");
  };

  // Submit and Generate Customer Miniature
  const handleGenerateMiniature = async () => {
    if (!uploadedPhotoUrl) {
      setCreationError("Please upload a photo, snap a selfie, or pick one of the preset models above.");
      return;
    }

    setIsGeneratingMiniature(true);
    setCreationError("");
    setCreationStepIndex(0);

    const steps = [
      "Analyzing facial features & skin tone...",
      "Sculpting your chibi figurine...",
      "Painting hair, outfit & details...",
      "Placing it on the showroom stand...",
    ];

    if (creationStepIntervalRef.current) {
      clearInterval(creationStepIntervalRef.current);
    }
    let currentStep = 0;
    const stepInterval = setInterval(() => {
      currentStep++;
      if (currentStep < steps.length) {
        setCreationStepIndex(currentStep);
      }
    }, 3500);
    creationStepIntervalRef.current = stepInterval;

    try {
      // Ensure photo payload is safely compressed
      const photoPayload = uploadedPhotoUrl.startsWith("data:image")
        ? await compressImage(uploadedPhotoUrl, 640, 0.8)
        : uploadedPhotoUrl;

      const response = await fetch("/api/stylist/create-miniature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoData: photoPayload,
          style: selectedStyle,
          build: selectedBuild,
          name: customerName,
          attire: selectedAttire,
        }),
      });

      const data = await response.json().catch(() => ({}));
      clearInterval(stepInterval);
      if (creationStepIntervalRef.current === stepInterval) {
        creationStepIntervalRef.current = null;
      }
      if (!response.ok || !data.miniature) throw new Error(data.error || "Generation error");

      // Compress generated miniature to max 640px JPEG for localStorage storage
      const figure: string = data.miniature.miniatureImageUrl || "/assets/aistudio/image_aa6d36c7.png";
      const compactFigure = figure.startsWith("data:image") ? await compressImage(figure, 640, 0.85) : figure;

      const newMini: CustomerMiniature = {
        ...data.miniature,
        userPhotoUrl: photoPayload,
        miniatureImageUrl: compactFigure || "/assets/aistudio/image_aa6d36c7.png",
        isAiGenerated: Boolean(data.miniature.isAiGenerated && compactFigure && compactFigure.startsWith("data:")),
        imageModel: data.miniature.imageModel,
      };

      setGenerationNotice(
        data.imageError
          ? data.imageErrorCode === "billing_required"
            ? "Gemini image generation requires a billing-enabled Google AI Studio project. We've applied your photo's analyzed features to our collectible chibi figurine so you can explore outfits and get instant fit verdicts!"
            : data.imageErrorCode === "no_key"
            ? "AI image generation isn't configured on the server yet (missing GEMINI_API_KEY), so a basic doll is shown instead."
            : `Notice: ${data.imageError}`
          : ""
      );
      setMiniature(newMini);
      setViewMode("fitting_room");
    } catch (err: any) {
      clearInterval(stepInterval);
      setCreationError(
        `Couldn't reach the AI stylist (${err?.message || "network error"}). Check your connection and try again.`
      );
    } finally {
      setIsGeneratingMiniature(false);
      handleStopCamera();
    }
  };

  // Add customized look to Bag
  const handleAddLookToCart = () => {
    if (!activeProduct) return;
    onAddToCart(activeProduct, selectedSize, selectedColor, 1);
    setAddedSuccess(true);
    setTimeout(() => setAddedSuccess(false), 2500);
  };

  // Ask AI Stylist a specific question
  const handleAskStylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stylistQuestion.trim() || !activeProduct) return;
    setIsAnswering(true);

    try {
      const prompt = `As DEN AI Stylist for THREAD DEN, answer this customer's question about wearing the "${activeProduct.name}" (${activeProduct.category}) in ${selectedColor.name} (Size ${selectedSize}) on their miniature model:\n"${stylistQuestion}"\nGive an inspiring, fashion-expert 2-3 sentence recommendation tailored to the garment type (western tee, shirt, saree, or chudidhar).`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", text: prompt }],
          role: "stylist",
        }),
      });
      const data = await res.json();
      setStylistAnswer(data.reply || "This silhouette complements your proportions with clean balance.");
    } catch {
      const kind = detectGarmentKind(activeProduct.category, activeProduct.name);
      setStylistAnswer(
        kind === "saree"
          ? `The ${selectedColor.name} weave highlights your miniature's complexion nicely. Pair with a clean fitted blouse, subtle gold jhumkas, and kitten-heel sandals.`
          : kind === "chudidhar"
          ? `This ${selectedColor.name} chudidhar in size ${selectedSize} offers comfortable shoulder room paired with tapered churidar gathers and ethnic mojaris.`
          : `The ${selectedColor.name} colorway in size ${selectedSize} delivers crisp proportions with straight-fit denim or tailored trousers.`
      );
    } finally {
      setIsAnswering(false);
      setStylistQuestion("");
    }
  };

  if (!isOpen) return null;

  const isDark = theme === "dark";
  const activeGarmentKind = detectGarmentKind(activeProduct?.category, activeProduct?.name);
  const filteredPresets = PRESET_MODELS.filter((m) => presetFilter === "all" || m.genderGroup === presetFilter);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/85 backdrop-blur-md"
        />

        {/* Studio Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={`relative w-full max-w-5xl rounded-3xl shadow-2xl border overflow-hidden transition-all my-auto z-10 flex flex-col ${
            isDark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-900"
          }`}
          id="ai-stylist-studio-modal"
        >
          {/* Top Bar */}
          <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
            isDark ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-150 bg-zinc-50"
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-zinc-950 flex items-center justify-center font-black shadow-md shadow-emerald-500/20">
                <Sparkles className="w-5 h-5 fill-zinc-950" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-black text-base sm:text-lg tracking-tight">
                    DEN AI Stylist
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                    Virtual Miniature Try-On
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  {viewMode === "create_miniature"
                    ? "Generate your personalized 3D miniature avatar"
                    : `Visualizing ${activeProduct?.name || "Garment"} on your personal model`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {miniature && viewMode === "fitting_room" && (
                <button
                  type="button"
                  onClick={() => setViewMode("create_miniature")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                    isDark
                      ? "border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white"
                      : "border-zinc-200 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-950"
                  }`}
                  id="recreate-miniature-btn"
                  title="Change photo or miniature style"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Change Photo</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  isDark ? "hover:bg-zinc-800 text-zinc-400 hover:text-white" : "hover:bg-zinc-200 text-zinc-500 hover:text-zinc-950"
                }`}
                id="close-ai-stylist-modal-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Content Body */}
          <div className="overflow-y-auto max-h-[82vh] p-4 sm:p-6">
            {/* ============================================================== */}
            {/* VIEW A: CREATE MINIATURE (Photo Upload / Camera / Presets)     */}
            {/* ============================================================== */}
            {viewMode === "create_miniature" ? (
              <div className="space-y-6 max-w-2xl mx-auto py-2">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Photorealistic Miniature Generator</span>
                  </div>
                  <h2 className="font-display font-black text-2xl sm:text-3xl tracking-tight">
                    Create Your Men&apos;s &amp; Women&apos;s Miniature
                  </h2>
                  <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
                    Upload a selfie or pick a 1-click miniature model wearing a <strong className={isDark ? "text-zinc-200" : "text-zinc-800"}>Saree, Chudidhar, Western Shirt, or Western Tee</strong> to preview real drape and color harmony.
                  </p>
                </div>

                {creationError && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium flex items-center gap-2">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>{creationError}</span>
                  </div>
                )}

                {/* Option Tabs / Methods */}
                <div className="space-y-4">
                  {/* Photo Preview & Capture Container */}
                  <div className={`p-4 sm:p-6 rounded-3xl border text-center relative overflow-hidden ${
                    isDark ? "bg-zinc-900/60 border-zinc-800" : "bg-zinc-50 border-zinc-200"
                  }`}>
                    {isCameraActive ? (
                      <div className="space-y-3">
                        <div className="relative w-64 h-64 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-black">
                          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
                          <div className="absolute inset-0 border-2 border-dashed border-emerald-400/40 rounded-full m-8 pointer-events-none" />
                        </div>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            onClick={handleCapturePhoto}
                            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold font-display text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                          >
                            <Camera className="w-4 h-4" /> Snap Photo
                          </button>
                          <button
                            type="button"
                            onClick={handleStopCamera}
                            className="px-4 py-2.5 bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl hover:bg-zinc-700 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : uploadedPhotoUrl ? (
                      <div className="space-y-3">
                        <div className="relative w-40 h-40 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-xl bg-zinc-200">
                          <img src={uploadedPhotoUrl} alt="Customer source" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          <div className="absolute bottom-2 right-2 bg-emerald-500 text-zinc-950 p-1 rounded-full shadow-md">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        </div>
                        <p className="text-xs text-emerald-400 font-mono font-bold">
                          Model photo selected &amp; ready for virtual try-on
                        </p>
                        <button
                          type="button"
                          onClick={() => setUploadedPhotoUrl("")}
                          className="text-xs text-zinc-400 hover:text-white underline font-mono cursor-pointer"
                        >
                          Choose another photo
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                          <Camera className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-display font-bold text-sm">Upload or capture your photo</p>
                          <p className="text-xs text-zinc-400">Clear front-facing portrait or upper-body selfie works best</p>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <label className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold font-display text-xs rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95">
                            <Upload className="w-4 h-4" />
                            <span>Upload From Gallery</span>
                            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                          </label>

                          <button
                            type="button"
                            onClick={handleStartCamera}
                            className={`px-4 py-2.5 rounded-xl font-bold font-display text-xs flex items-center gap-2 border transition-all cursor-pointer ${
                              isDark ? "bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700" : "bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-300 shadow-xs"
                            }`}
                          >
                            <Camera className="w-4 h-4 text-emerald-400" />
                            <span>Use Camera</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 1-Click Fast Chibi Miniature Presets (Women & Men) */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                        Or Pick a 1-Click Sample Miniature Model
                      </span>
                      <div className="flex items-center gap-1 p-0.5 rounded-xl border border-zinc-800 bg-zinc-900/70">
                        {[
                          { id: "all", label: "All Models" },
                          { id: "women", label: "Women (Saree, Chudidhar & Western)" },
                          { id: "men", label: "Men (Western)" },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setPresetFilter(tab.id as "all" | "women" | "men")}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                              presetFilter === tab.id
                                ? "bg-emerald-500 text-zinc-950 shadow-xs"
                                : "text-zinc-400 hover:text-white"
                            }`}
                            id={`preset-filter-${tab.id}-btn`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {filteredPresets.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPresetModel(preset)}
                          id={preset.id}
                          className={`p-2.5 rounded-2xl border text-left flex flex-col items-center gap-2 transition-all cursor-pointer ${
                            uploadedPhotoUrl === preset.photo
                              ? "bg-emerald-500/15 border-emerald-500/50 shadow-md ring-2 ring-emerald-500/40"
                              : isDark
                              ? "bg-zinc-900/50 border-zinc-800 hover:bg-zinc-850"
                              : "bg-zinc-50 border-zinc-200 hover:bg-zinc-100"
                          }`}
                        >
                          <div className="w-18 h-20 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-200 shrink-0 flex items-center justify-center">
                            {failedPresetIds[preset.id] ? (
                              <span className="text-[10px] font-mono font-bold text-zinc-700 px-1 text-center">{preset.name}</span>
                            ) : (
                              <img
                                src={preset.photo}
                                alt={preset.name}
                                referrerPolicy="no-referrer"
                                onError={() => setFailedPresetIds((prev) => ({ ...prev, [preset.id]: true }))}
                                className="w-full h-full object-cover object-top"
                              />
                            )}
                          </div>
                          <div className="min-w-0 text-center w-full">
                            <span className={`font-bold text-xs block truncate ${isDark ? "text-white" : "text-zinc-900"}`}>
                              {preset.name}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-mono block truncate">{preset.subtitle}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Base Miniature Attire Selector */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                      Miniature Outfit Silhouette Base (for Selfie Generation)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {[
                        { id: "western_tee", label: "Western Tee" },
                        { id: "western_shirt", label: "Western Shirt" },
                        { id: "saree", label: "Saree Drape" },
                        { id: "chudidhar", label: "Chudidhar Set" },
                      ].map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() => setSelectedAttire(att.id as AttireType)}
                          id={`attire-select-${att.id}`}
                          className={`py-2 px-2 text-[11px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                            selectedAttire === att.id
                              ? "bg-emerald-500 text-zinc-950 border-emerald-400 shadow-xs"
                              : isDark
                              ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                              : "bg-white border-zinc-200 text-zinc-700"
                          }`}
                        >
                          {att.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Miniature Figurine Style & Build Options */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                        Miniature Aesthetic Style
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: "streetwear_vinyl", label: "3D Vinyl Toy" },
                          { id: "realistic_scale", label: "Studio Scale" },
                          { id: "anime_chibi", label: "Chibi Doll" },
                        ].map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => setSelectedStyle(st.id as any)}
                            className={`py-2 px-1 text-[11px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                              selectedStyle === st.id
                                ? "bg-emerald-500 text-zinc-950 border-emerald-400 shadow-xs"
                                : isDark
                                ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                                : "bg-white border-zinc-200 text-zinc-700"
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                        Body Silhouette Build
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { id: "regular", label: "Standard" },
                          { id: "athletic", label: "Athletic" },
                          { id: "oversized_loose", label: "Relaxed" },
                        ].map((bld) => (
                          <button
                            key={bld.id}
                            type="button"
                            onClick={() => setSelectedBuild(bld.id as any)}
                            className={`py-2 px-1 text-[11px] font-bold rounded-xl border text-center transition-all cursor-pointer ${
                              selectedBuild === bld.id
                                ? "bg-emerald-500 text-zinc-950 border-emerald-400 shadow-xs"
                                : isDark
                                ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                                : "bg-white border-zinc-200 text-zinc-700"
                            }`}
                          >
                            {bld.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Generate Button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      disabled={isGeneratingMiniature || !uploadedPhotoUrl}
                      onClick={handleGenerateMiniature}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 font-display font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 transition-all active:scale-98 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      id="generate-miniature-cta-btn"
                    >
                      {isGeneratingMiniature ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>{["Analyzing your photo", "Sculpting your figurine", "Painting details", "Almost done"][creationStepIndex] || "Generating"} ({creationStepIndex + 1}/4)…</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 fill-zinc-950" />
                          <span>Launch Virtual Try-On With My Miniature</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================== */
              /* VIEW B: INTERACTIVE VIRTUAL FITTING STUDIO (TRY-ON)            */
              /* ============================================================== */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: 3D MINIATURE SHOWROOM STAGE */}
                <div className="lg:col-span-6 space-y-4">
                  <div
                    className={`relative rounded-3xl border overflow-hidden p-6 aspect-[4/5] flex flex-col items-center justify-between shadow-2xl transition-all ${
                      isDark
                        ? "bg-radial from-zinc-850 via-zinc-900 to-zinc-950 border-zinc-800"
                        : "bg-radial from-zinc-100 via-zinc-50 to-zinc-200 border-zinc-200"
                    }`}
                    id="miniature-display-stage"
                  >
                    {/* Top Stage Header & Controls */}
                    <div className="w-full flex items-center justify-between gap-2 z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-zinc-900/90 backdrop-blur-md text-emerald-400 border border-zinc-700/80 flex items-center gap-1.5 shadow-sm shrink-0">
                          <span className={`w-2 h-2 rounded-full ${isTryingOn ? "bg-amber-400" : "bg-emerald-500"} animate-pulse`} />
                          {figureImage ? "Your AI Miniature" : "Basic Doll"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-300 bg-zinc-900/80 border border-zinc-800 truncate">
                          {miniature?.name || "Member"}
                        </span>
                      </div>

                      {/* Before / Wearing it Toggle */}
                      {figureImage && (
                        <div className="flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md p-1 rounded-xl border border-zinc-800 text-[11px] font-mono font-bold shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowBaseFigure(true)}
                            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                              showBaseFigure ? "bg-emerald-500 text-zinc-950 font-black" : "text-zinc-400 hover:text-white"
                            }`}
                            id="stylist-view-before-btn"
                          >
                            Before
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowBaseFigure(false)}
                            disabled={!dressedImage}
                            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              !showBaseFigure ? "bg-emerald-500 text-zinc-950 font-black" : "text-zinc-400 hover:text-white"
                            }`}
                            id="stylist-view-after-btn"
                          >
                            Wearing it
                          </button>
                        </div>
                      )}
                    </div>

                    {generationNotice && (
                      <div className="w-full mt-2 z-10 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="flex-1">{generationNotice}</span>
                        <button
                          type="button"
                          onClick={() => setViewMode("create_miniature")}
                          className="underline font-bold shrink-0 cursor-pointer"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!generationNotice && miniature && !figureImage && (
                      <div className="w-full mt-2 z-10 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="flex-1">No AI miniature image available. Create your miniature from your photo to see try-ons.</span>
                        <button
                          type="button"
                          onClick={() => setViewMode("create_miniature")}
                          className="underline font-bold shrink-0 cursor-pointer"
                        >
                          Create
                        </button>
                      </div>
                    )}

                    {/* Spotlight glow behind miniature */}
                    <div className="absolute top-1/4 w-72 h-72 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

                    {/* Stage Display: Real Miniature Image vs Fallback CSS Doll */}
                    {figureImage ? (
                      /* Real AI Miniature Figurine Image */
                      <div className="relative flex-1 min-h-0 w-full my-3 flex items-center justify-center" id="ai-miniature-stage">
                        <div
                          className="relative h-full max-h-full aspect-[3/4] rounded-2xl overflow-hidden border border-zinc-700/60 shadow-2xl bg-zinc-200 transition-transform duration-300"
                          style={{ transform: `scale(${zoomLevel})` }}
                        >
                          <img
                            key={showBaseFigure || !dressedImage ? "base" : tryOnKey}
                            src={showBaseFigure || !dressedImage ? figureImage : dressedImage}
                            alt={
                              showBaseFigure || !dressedImage
                                ? `${miniature?.name || "Your"} miniature`
                                : `${miniature?.name || "Your"} miniature wearing ${activeProduct?.name} in ${selectedColor.name}`
                            }
                            className={`w-full h-full object-cover transition-all duration-500 ${
                              isTryingOn ? "blur-[2px] brightness-75 scale-[1.01]" : ""
                            }`}
                            id="ai-miniature-image"
                          />

                          {isTryingOn && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/40 backdrop-blur-[1px] text-center px-4">
                              <div className="w-12 h-12 rounded-full border-4 border-emerald-400/30 border-t-emerald-400 animate-spin" />
                              <div>
                                <p className="font-display font-black text-sm text-white">
                                  Dressing you…
                                </p>
                                <p className="text-[11px] font-mono text-emerald-300 mt-0.5">{TRYON_STEPS[tryOnStepIndex]}</p>
                              </div>
                            </div>
                          )}

                          {!isTryingOn && tryOnError && !dressedImage && (
                            <div className="absolute inset-x-3 bottom-3 p-2.5 rounded-xl bg-zinc-950/90 border border-rose-500/40 text-[11px] text-rose-300 flex items-start gap-2 text-left">
                              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span className="flex-1">{tryOnError}</span>
                              <button
                                type="button"
                                onClick={() => setTryOnNonce((n) => n + 1)}
                                className="underline font-bold text-white shrink-0 cursor-pointer"
                              >
                                Retry
                              </button>
                            </div>
                          )}

                          {!isTryingOn && dressedImage && !showBaseFigure && (
                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-mono font-bold bg-zinc-950/80 text-emerald-300 border border-emerald-500/30">
                              AI TRY-ON · {selectedSize}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Fallback CSS Doll (Only shown when no AI image exists) */
                      <div className="relative my-auto flex flex-col items-center" style={{ transform: `scale(${zoomLevel})` }}>
                        <div className="relative w-52 sm:w-60 h-80 sm:h-88 flex flex-col items-center select-none">
                          {/* Chibi Head */}
                          <div className="relative z-30 flex flex-col items-center">
                            <div
                              className="relative w-24 sm:w-28 h-18 -mb-10 z-20 rounded-t-[38px] rounded-b-[18px] shadow-lg overflow-hidden border border-black/30"
                              style={{ backgroundColor: miniature?.hairColor || "#543825" }}
                            >
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-white/20 to-transparent pointer-events-none" />
                              <div className="absolute top-1 left-3 w-8 h-3 rounded-full bg-white/20 rotate-12 blur-[1px]" />
                            </div>

                            <div className="relative w-22 sm:w-26 h-22 sm:h-26 rounded-full overflow-hidden shadow-2xl border-2 border-black/20 bg-gradient-to-b from-[#fff5ea] via-[#faebd7] to-[#f4deb8] flex flex-col items-center justify-center">
                              <div className="relative w-full h-full flex flex-col items-center justify-center pt-2">
                                <div className="w-16 flex items-center justify-between px-1.5 pt-2">
                                  <svg className="w-5 h-3 text-[#3a251b]" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                                    <path d="M 2 10 Q 12 1 22 10" />
                                  </svg>
                                  <svg className="w-5 h-3 text-[#3a251b]" viewBox="0 0 24 12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
                                    <path d="M 2 10 Q 12 1 22 10" />
                                  </svg>
                                </div>
                                <div className="w-18 flex items-center justify-between px-1 -mt-0.5">
                                  <span className="w-3.5 h-2 rounded-full bg-rose-400/35 blur-[1px]" />
                                  <span className="w-3.5 h-2 rounded-full bg-rose-400/35 blur-[1px]" />
                                </div>
                                <div className="flex flex-col items-center -mt-0.5">
                                  <span className="w-1 h-1 rounded-full bg-[#c9957c]/60 mb-0.5" />
                                  <svg className="w-4 h-2 text-[#b85353]" viewBox="0 0 16 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                    <path d="M 2 2 Q 8 7 14 2" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Fallback Torso */}
                          <div className="relative -mt-2 z-20 w-40 sm:w-48 flex flex-col items-center transition-all duration-300">
                            <div
                              className="w-full h-34 sm:h-38 rounded-2xl relative shadow-2xl overflow-hidden border border-black/25"
                              style={{ backgroundColor: selectedColor.hex }}
                            >
                              <div className="w-14 h-4.5 mx-auto rounded-b-xl border-b-2 border-black/35 bg-black/15 shadow-inner" />
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                                <span className="text-[9px] font-black font-display tracking-widest uppercase opacity-60 text-white select-none">
                                  {brandName}
                                </span>
                                <span className="text-[9px] font-mono font-bold text-white/90 mt-1 uppercase tracking-wider">
                                  240+ GSM
                                </span>
                              </div>
                            </div>
                            <div className="absolute -left-3.5 top-2.5 w-6 h-18 rounded-xl border border-black/25 shadow-lg rotate-14" style={{ backgroundColor: selectedColor.hex }} />
                            <div className="absolute -right-3.5 top-2.5 w-6 h-18 rounded-xl border border-black/25 shadow-lg -rotate-14" style={{ backgroundColor: selectedColor.hex }} />
                          </div>

                          {/* Fallback Pants */}
                          <div className="relative -mt-1.5 z-10 flex items-center gap-1.5">
                            <div className="w-13 h-22 rounded-b-xl bg-gradient-to-b from-[#1a2332] to-[#121824] border border-black/30 shadow-md" />
                            <div className="w-13 h-22 rounded-b-xl bg-gradient-to-b from-[#1a2332] to-[#121824] border border-black/30 shadow-md" />
                          </div>

                          {/* Fallback Shoes */}
                          <div className="flex items-center gap-2 -mt-1.5 z-20">
                            <div className="w-15 h-6.5 rounded-xl bg-white border border-zinc-400 shadow-md flex items-center justify-center text-[7px] font-black font-mono text-zinc-950">
                              DEN-01
                            </div>
                            <div className="w-15 h-6.5 rounded-xl bg-white border border-zinc-400 shadow-md flex items-center justify-center text-[7px] font-black font-mono text-zinc-950">
                              DEN-01
                            </div>
                          </div>
                        </div>

                        {/* Plinth */}
                        <div className="w-52 sm:w-60 h-10 -mt-2 rounded-full bg-gradient-to-b from-zinc-800 to-zinc-950 border-2 border-emerald-500/60 shadow-2xl flex flex-col items-center justify-center">
                          <span className="text-[8px] font-mono font-bold text-emerald-400">THREAD DEN · COLLECTIBLE</span>
                        </div>
                      </div>
                    )}

                    {/* Stage Footer Bar with Controls */}
                    <div className="w-full flex items-center justify-between gap-2 z-10 pt-2 border-t border-zinc-800/60">
                      <div className="text-left min-w-0">
                        <span className="text-[10px] text-zinc-400 font-mono uppercase block">Model Wearing</span>
                        <span className="font-bold text-xs text-white truncate block max-w-[200px]">
                          {activeProduct?.name} ({selectedColor.name})
                        </span>
                        {miniature?.imageModel && (
                          <span className="text-[9px] text-zinc-500 font-mono block truncate max-w-[220px]" id="stylist-engine-label">
                            Engine:{" "}
                            {miniature.imageModel.startsWith("cloudflare:")
                              ? `${miniature.imageModel.split("/").pop()} (Cloudflare)`
                              : miniature.imageModel === "preset"
                              ? "preset doll"
                              : `${miniature.imageModel} (Gemini)`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {figureImage && (
                          <button
                            type="button"
                            disabled={isTryingOn}
                            onClick={() => {
                              setTryOnCache((prev) => {
                                const next = prev.filter((c) => c.key !== tryOnKey);
                                saveTryOnCache(next);
                                return next;
                              });
                              setTryOnNonce((n) => n + 1);
                            }}
                            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 cursor-pointer"
                            title="Regenerate this look"
                            id="stylist-regenerate-look-btn"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isTryingOn ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        {figureImage && (
                          <a
                            href={showBaseFigure || !dressedImage ? figureImage : dressedImage}
                            download={`${(miniature?.name || "my").replace(/\s+/g, "-").toLowerCase()}-${
                              showBaseFigure || !dressedImage ? "miniature" : (activeProduct?.id || "look")
                            }.jpg`}
                            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                            title="Download this image"
                            id="stylist-download-look-btn"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setZoomLevel((prev) => (prev === 1 ? 1.15 : 1))}
                          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
                          title="Toggle zoom"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN: INTERACTIVE CONTROLS & FIT VERDICT */}
                <div className="lg:col-span-6 space-y-5">
                  {/* Product Header */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-zinc-800 text-zinc-300 uppercase">
                        {activeProduct?.category}
                      </span>
                      {activeProduct && activeProduct.stockCount < 5 && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Low Stock
                        </span>
                      )}
                    </div>
                    <h2 className="font-display font-black text-xl sm:text-2xl tracking-tight text-white">
                      {activeProduct?.name}
                    </h2>
                    <div className="flex items-center gap-3 pt-0.5">
                      <span className="font-mono font-bold text-lg text-emerald-400">
                        {currencySymbol}{activeProduct?.price.toLocaleString()}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {activeGarmentKind === "saree"
                          ? "Woven Drape & Bordered Pallu"
                          : activeGarmentKind === "chudidhar"
                          ? "Kurta, Churidar & Dupatta Set"
                          : activeGarmentKind === "shirt"
                          ? "Tailored Western Button-Down"
                          : "240+ GSM Combed Cotton Cut"}
                      </span>
                    </div>
                  </div>

                  {/* GARMENT VIEW PICKER (FRONT VS BACK PRINT WHEN 2 PHOTOS EXIST) */}
                  {hasBackProductPhoto && (
                    <div className="space-y-2 p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-300">Try-On Garment Side:</span>
                        <span className="font-mono text-emerald-400 font-bold">
                          {activeGarmentSide === "back" ? "Back Print Photo" : "Front View Photo"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setGarmentView("front")}
                          className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeGarmentSide === "front"
                              ? "bg-emerald-500/15 border-emerald-400 text-white"
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                          id="stylist-garment-front-btn"
                        >
                          <img
                            src={frontProductPhoto}
                            alt="Front View"
                            className="w-8 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-left">
                            <span className="text-xs font-bold block">Front View</span>
                            <span className="text-[10px] font-mono text-zinc-400">Photo 1</span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setGarmentView("back")}
                          className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all cursor-pointer ${
                            activeGarmentSide === "back"
                              ? "bg-emerald-500/15 border-emerald-400 text-white"
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                          id="stylist-garment-back-btn"
                        >
                          <img
                            src={backProductPhoto}
                            alt="Back Print"
                            className="w-8 h-10 rounded-lg object-cover border border-zinc-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-left">
                            <span className="text-xs font-bold block">Back Print</span>
                            <span className="text-[10px] font-mono text-zinc-400">Photo 2</span>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 1. REAL-TIME COLOR PICKER FOR MINIATURE */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-300">Select Garment Color:</span>
                      <span className="font-mono text-emerald-400 font-bold">{selectedColor.name}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {activeProduct?.colors.map((color) => {
                        const isSelected = selectedColor.name === color.name;
                        return (
                          <button
                            key={color.name}
                            type="button"
                            onClick={() => setSelectedColor(color)}
                            className={`p-1.5 rounded-xl border flex items-center gap-2 transition-all cursor-pointer ${
                              isSelected
                                ? "bg-zinc-800 border-emerald-400 ring-2 ring-emerald-400/40 text-white"
                                : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                          >
                            <span
                              className="w-4 h-4 rounded-full border border-black/40 block"
                              style={{ backgroundColor: color.hex }}
                            />
                            <span className="text-xs font-medium pr-1">{color.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. SIZE SELECTOR WITH FIT EFFECTS */}
                  <div className="space-y-2 p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-zinc-300">Select Size:</span>
                      <span className="font-mono text-zinc-400">
                        {activeGarmentKind === "saree" || selectedSize.toUpperCase() === "FREE SIZE"
                          ? "Traditional Full-Length Drape"
                          : activeGarmentKind === "chudidhar"
                          ? `${selectedSize} Tailored Kurta & Churidar`
                          : activeGarmentKind === "shirt"
                          ? `${selectedSize} Structured Collar Fit`
                          : selectedSize === "M"
                          ? "True Relaxed"
                          : selectedSize === "L"
                          ? "Drop-Shoulder Boxy (Recommended)"
                          : "Oversized Baggy"}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                      {activeProduct?.sizes.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => setSelectedSize(sz)}
                          className={`py-2 px-1 text-xs font-mono font-bold rounded-xl border text-center transition-all cursor-pointer ${
                            selectedSize === sz
                              ? "bg-emerald-500 text-zinc-950 border-emerald-400 font-black shadow-md shadow-emerald-500/20"
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                        >
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 3. AI FIT SUITABILITY VERDICT CARD */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Flame className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold block">
                            DEN AI Fit Score
                          </span>
                          <span className="font-display font-black text-sm text-white">
                            {verdict?.matchLevel ||
                              (activeGarmentKind === "saree"
                                ? "Graceful Heritage Drape"
                                : activeGarmentKind === "chudidhar"
                                ? "Refined Chudidhar Fit"
                                : activeGarmentKind === "shirt"
                                ? "Crisp Western Tailoring"
                                : "Great Western Drape")}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-black text-2xl text-emerald-400">
                          {verdict?.fitScore ?? "--"}%
                        </span>
                        <span className="text-[9px] text-zinc-400 block font-mono">Suitability Match</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1 text-xs border-t border-zinc-800/80">
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono">
                        {isAnalyzingFit || isTryingOn ? (
                          <span className="text-zinc-400 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> Updating verdict…
                          </span>
                        ) : verdict?.basedOnPreview ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Judged from your try-on preview
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                            General estimate
                          </span>
                        )}
                      </div>
                      {verdict?.colorSynergy && (
                        <p className="text-zinc-400 leading-relaxed">
                          <strong className="text-zinc-200">Colour:</strong> {verdict.colorSynergy}
                        </p>
                      )}
                      <p className="text-zinc-300 leading-relaxed">
                        {verdict?.stylistAdvice ||
                          (activeGarmentKind === "saree"
                            ? "The bordered pallu and pleated fall highlight your miniature's posture cleanly."
                            : activeGarmentKind === "chudidhar"
                            ? "The tailored kurta neckline and dupatta drape frame your miniature effortlessly."
                            : "Clean shoulder balance and structured weave sit naturally on your miniature model.")}
                      </p>
                    </div>

                    {/* Recommended Pairings */}
                    {verdict?.recommendedPairings && (
                      <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800 space-y-1 text-[11px] text-zinc-400">
                        <div>
                          <strong className="text-zinc-200">Recommended Bottoms:</strong> {verdict.recommendedPairings.bottoms}
                        </div>
                        <div>
                          <strong className="text-zinc-200">Recommended Footwear:</strong> {verdict.recommendedPairings.footwear}
                        </div>
                        {verdict.recommendedPairings.accessories && (
                          <div>
                            <strong className="text-zinc-200">Accessories:</strong> {verdict.recommendedPairings.accessories}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 4. ACTIONS: ADD TO BAG & BROWSE NEXT */}
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAddLookToCart}
                      className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-display font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-98 cursor-pointer"
                      id="stylist-add-to-bag-btn"
                    >
                      {addedSuccess ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Added to Cart ({selectedSize} • {selectedColor.name})!</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ShoppingBag className="w-4 h-4 fill-zinc-950" />
                          <span>Add This Look to Bag ({currencySymbol}{activeProduct?.price})</span>
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      )}
                    </button>

                    {/* Quick browse carousel of catalog pieces */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-zinc-400 font-mono">Try other catalog pieces:</span>
                      <div className="flex items-center gap-1.5 overflow-x-auto max-w-[280px]">
                        {products.map((p) => {
                          const isCurrent = activeProduct?.id === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => onSelectProduct(p)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold font-mono transition-all shrink-0 cursor-pointer ${
                                isCurrent
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                              }`}
                            >
                              {p.name.split(" ").slice(0, 2).join(" ")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 5. ASK AI STYLIST QUESTION ACCORDION */}
                  <form onSubmit={handleAskStylist} className="pt-2 border-t border-zinc-800/80 space-y-2">
                    <label className="text-[10px] font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                      Ask DEN AI Stylist About This Look
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g. What blouse/bottoms match? Which earrings or shoes fit best?"
                        value={stylistQuestion}
                        onChange={(e) => setStylistQuestion(e.target.value)}
                        className="flex-grow py-2.5 px-3.5 rounded-xl border border-zinc-800 bg-zinc-900/80 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500 transition-all"
                      />
                      <button
                        type="submit"
                        disabled={isAnswering || !stylistQuestion.trim()}
                        className="px-3.5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl border border-zinc-700 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {isAnswering ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {stylistAnswer && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 leading-relaxed font-sans"
                      >
                        <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-[10px] mb-1">
                          <Sparkles className="w-3 h-3" />
                          <span>Stylist Response:</span>
                        </div>
                        {stylistAnswer}
                      </motion.div>
                    )}
                  </form>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
