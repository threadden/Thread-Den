import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { 
  Filter, Sparkles, AlertCircle, ShoppingBag, ArrowRight, Settings, 
  HelpCircle, ChevronLeft, ChevronRight, Sliders, Smartphone, SlidersHorizontal, X, RotateCcw,
  Lock, ShieldCheck, KeyRound
} from "lucide-react";
import { Product, CartItem, Order, ResellerCalculator, UserProfile, BrandPartner, CustomerReview } from "./types";
import {
  DEFAULT_PRODUCTS,
  CATEGORIES,
  MEN_CATEGORIES,
  WOMEN_CATEGORIES,
  inferProductCollection,
  DEFAULT_CALCULATOR,
  DEFAULT_ORDERS,
  DEFAULT_BRAND_PARTNERS,
} from "./data";

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

// Component imports (above-the-fold eager, heavy modals/back-office code-split for fast FCP)
import Header from "./components/Header";
import Hero from "./components/Hero";
import ProductCard from "./components/ProductCard";
import Testimonials from "./components/Testimonials";
import PushNotificationCenter, { PushNotification } from "./components/PushNotificationCenter";
import Footer from "./components/Footer";
import IntroSplash from "./components/IntroSplash";

const ProductDetailModal = lazy(() => import("./components/ProductDetailModal"));
const CartSidebar = lazy(() => import("./components/CartSidebar"));
const MerchantPortal = lazy(() => import("./components/MerchantPortal"));
const AccountModal = lazy(() => import("./components/AccountModal"));
const FilterModal = lazy(() => import("./components/FilterModal"));
const AuthModal = lazy(() => import("./components/AuthModal"));
const AiStylistModal = lazy(() => import("./components/AiStylistModal"));
import {
  testFirestoreConnection,
  seedProductsIfEmpty,
  subscribeProducts,
  saveProductDoc,
  deleteProductDoc,
  updateProductStockDoc,
  getUserProfile,
  saveUserProfile,
  ensureSingleAdminAccount,
  saveOrderDoc,
  subscribeOrders,
  subscribeUsers,
  subscribeReviews,
  saveReviewDoc,
  deleteReviewDoc,
} from "./firebase";

export default function App() {
  // --- 0. 5-SECOND BRAND INTRO SPLASH ON INITIAL LOAD ---
  const [showIntroSplash, setShowIntroSplash] = useState<boolean>(true);

  // --- 1. LOCAL PERSISTENCE STATE ENGINE ---
  // Merchant Hub is CLOSED by default: Storefront is the default viewport
  const [currentMode, setCurrentMode] = useState<"customer" | "merchant">("customer");

  // Admin Auth State: False by default so merchant hub is locked and closed
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // AI Stylist Miniature Fitting Room State
  const [isStylistOpen, setIsStylistOpen] = useState<boolean>(false);
  const [stylistTargetProduct, setStylistTargetProduct] = useState<Product | null>(null);
  const [stylistTargetColor, setStylistTargetColor] = useState<{ name: string; hex: string } | undefined>(undefined);
  const [stylistTargetView, setStylistTargetView] = useState<"front" | "back">("front");
  const categoryRailRef = useRef<HTMLDivElement | null>(null);

  const handleOpenStylist = (product?: Product, color?: { name: string; hex: string }, view: "front" | "back" = "front") => {
    if (product) {
      setStylistTargetProduct(product);
      setStylistTargetColor(color);
      setStylistTargetView(view);
    } else if (!stylistTargetProduct && products.length > 0) {
      setStylistTargetProduct(products[0]);
      setStylistTargetView("front");
    }
    setIsStylistOpen(true);
  };

  // Enforce that merchant mode is NEVER open if not admin authenticated
  useEffect(() => {
    if (currentMode === "merchant" && !isAdminAuthenticated) {
      setCurrentMode("customer");
    }
  }, [currentMode, isAdminAuthenticated]);

  const handleModeChange = (mode: "customer" | "merchant") => {
    if (mode === "merchant" && !isAdminAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    setCurrentMode(mode);
  };

  const handleAdminSuccess = () => {
    setIsAdminAuthenticated(true);
    setIsAuthModalOpen(false);
    setCurrentMode("merchant");
    setNotifications((prev) => [
      {
        id: `notif_${Date.now()}`,
        title: "🛡️ Admin Authenticated",
        body: "Welcome to the Reseller Merchant Hub Back-Office.",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
  };

  const handleAdminSignOut = () => {
    setIsAdminAuthenticated(false);
    sessionStorage.removeItem("tshirt_reseller_admin_auth");
    setCurrentMode("customer");
    setNotifications((prev) => [
      {
        id: `notif_${Date.now()}`,
        title: "🔒 Admin Portal Locked",
        body: "You have signed out of the Merchant Admin Portal.",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
  };

  // User Profile / Customer Auth state: null by default so "Login / Sign Up" shows by default
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);

  // Auth Modal contextual modes (e.g. checkout interception vs manual login)
  const [authModalInitialMode, setAuthModalInitialMode] = useState<"signin" | "signup">("signin");
  const [authModalCheckoutContext, setAuthModalCheckoutContext] = useState<{
    itemCount: number;
    totalAmount: number;
    currencySymbol: string;
  } | null>(null);

  const handleCustomerLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    const wasCheckoutFlow = Boolean(authModalCheckoutContext);
    setAuthModalCheckoutContext(null);
    if (!wasCheckoutFlow) {
      setIsAccountOpen(true);
    }
    setNotifications((prev) => [
      {
        id: `notif_${Date.now()}`,
        title: `👋 Welcome, ${user.name}`,
        body: `Signed in as ${user.name}. Your account is now active.`,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
  };

  const [isAccountOpen, setIsAccountOpen] = useState<boolean>(false);

  // Synchronize User profile with Firestore database on mount
  useEffect(() => {
    // 1. Test Firestore database connection & ensure single admin account exists
    testFirestoreConnection();
    ensureSingleAdminAccount().catch(console.error);

    // 2. Refresh current user details from Firestore if user session exists
    const savedUserJson = localStorage.getItem("tshirt_reseller_user");
    if (savedUserJson) {
      try {
        const localUser: UserProfile = JSON.parse(savedUserJson);
        if (localUser.id) {
          getUserProfile(localUser.id)
            .then((freshDbProfile) => {
              if (freshDbProfile) {
                console.log("Matched and refreshed user account from Firestore database:", freshDbProfile.name);
                setCurrentUser(freshDbProfile);
              } else {
                // Account no longer exists in Firestore (e.g. deleted) -> sign out locally
                localStorage.removeItem("tshirt_reseller_user");
                setCurrentUser(null);
              }
            })
            .catch(() => {
              localStorage.removeItem("tshirt_reseller_user");
              setCurrentUser(null);
            });
        }
      } catch (err) {
        console.warn("Failed to parse local user profile:", err);
        localStorage.removeItem("tshirt_reseller_user");
      }
    }

    // 3. Seed catalog articles to Firestore database if empty
    seedProductsIfEmpty(DEFAULT_PRODUCTS).catch(console.error);

    // 4. Real-time subscription to articles database (connected to Merchant Hub)
    const unsubProducts = subscribeProducts((dbProducts) => {
      if (dbProducts && dbProducts.length > 0) {
        setProducts(dbProducts);
      }
    });

    // 5. Real-time subscription to orders database
    const unsubOrders = subscribeOrders((dbOrders) => {
      if (dbOrders && dbOrders.length > 0) {
        setOrders(dbOrders);
      }
    });

    // 6. Real-time subscription to registered customer profiles & customer reviews
    const unsubUsers = subscribeUsers((dbUsers) => {
      setRegisteredUsers(dbUsers);
    });

    const unsubReviews = subscribeReviews((dbReviews) => {
      setReviews(dbReviews);
    });

    return () => {
      unsubProducts();
      unsubOrders();
      unsubUsers();
      unsubReviews();
    };
  }, []);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem("tshirt_reseller_user", JSON.stringify(currentUser));
      } else {
        localStorage.removeItem("tshirt_reseller_user");
      }
    } catch {
      // Ignore storage errors
    }
  }, [currentUser]);

  const [products, setProducts] = useState<Product[]>(() => {
    const parsed = safeReadJson<Product[]>("tshirt_reseller_products", []);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const defaultById = new Map(DEFAULT_PRODUCTS.map((dp) => [dp.id, dp]));
      const existingIds = new Set(parsed.map((p) => p.id));
      const missingDefaults = DEFAULT_PRODUCTS.filter((p) => !existingIds.has(p.id));
      const combined = [...parsed, ...missingDefaults];
      const merged = combined.map((p) => {
        const def = defaultById.get(p.id);
        const normalizedCollection = p.collection || def?.collection || inferProductCollection(p);
        const normalizedCategory =
          def && p.category?.includes("Men & Women") ? def.category : p.category;
        const syncedPrice =
          def && p.id === "prod_daily_slub" && p.price === 1190 ? def.price : p.price;
        const syncedBasePrice =
          def && p.id === "prod_daily_slub" && p.price === 1190 ? def.basePrice : p.basePrice;
        if (def?.backImage && !p.backImage) {
          return {
            ...p,
            price: syncedPrice,
            basePrice: syncedBasePrice,
            category: normalizedCategory,
            collection: normalizedCollection,
            backImage: def.backImage,
            images: p.images && p.images.length > 1 && p.images.includes(def.backImage) ? p.images : def.images,
            colors: def.colors,
          };
        }
        return {
          ...p,
          price: syncedPrice,
          basePrice: syncedBasePrice,
          category: normalizedCategory,
          collection: normalizedCollection,
        };
      });
      const hasAnyFeatured = merged.some((p) => p.isFeatured === true);
      if (!hasAnyFeatured && merged.length > 0) {
        return merged.map((p, idx) => ({
          ...p,
          isFeatured: idx < 4,
        }));
      }
      return merged;
    }
    return DEFAULT_PRODUCTS;
  });

  const [orders, setOrders] = useState<Order[]>(() =>
    safeReadJson<Order[]>("tshirt_reseller_orders", DEFAULT_ORDERS)
  );

  const [brandPartners, setBrandPartners] = useState<BrandPartner[]>(() =>
    safeReadJson<BrandPartner[]>("tshirt_reseller_brand_partners", DEFAULT_BRAND_PARTNERS)
  );

  useEffect(() => {
    safeWriteJson("tshirt_reseller_brand_partners", brandPartners);
  }, [brandPartners]);

  const [calculator, setCalculator] = useState<ResellerCalculator>(() =>
    safeReadJson<ResellerCalculator>("tshirt_reseller_calculator", DEFAULT_CALCULATOR)
  );

  const [brandName, setBrandName] = useState<string>(() => {
    return localStorage.getItem("tshirt_reseller_brand") || "THREAD DEN";
  });

  const [merchantWhatsApp, setMerchantWhatsApp] = useState<string>(() => {
    const saved = localStorage.getItem("tshirt_reseller_whatsapp");
    if (!saved || saved.includes("98765 43210")) {
      return "+91 97100 10989";
    }
    return saved;
  });

  const [currencySymbol, setCurrencySymbol] = useState<string>(() => {
    return localStorage.getItem("tshirt_reseller_currency") || "₹";
  });

  // Global Theme State & Persistence (Default is 'dark')
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("tshirt_reseller_theme");
    return (saved as "dark" | "light") || "dark";
  });

  useEffect(() => {
    localStorage.setItem("tshirt_reseller_theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const isDark = theme === "dark";

  // Wishlist / Saved Items State & Persistence
  const [wishlistProductIds, setWishlistProductIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("tshirt_reseller_wishlist");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return ["prod_1", "prod_3"];
      }
    }
    return ["prod_1", "prod_3"];
  });

  useEffect(() => {
    localStorage.setItem("tshirt_reseller_wishlist", JSON.stringify(wishlistProductIds));
  }, [wishlistProductIds]);

  const handleToggleWishlist = (product: Product) => {
    setWishlistProductIds((prev) => {
      const exists = prev.includes(product.id);
      return exists ? prev.filter((id) => id !== product.id) : [...prev, product.id];
    });
  };

  // Price Drop Alert Subscriptions State & Persistence
  const [priceAlertProductIds, setPriceAlertProductIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("tshirt_reseller_price_alerts");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return ["prod_1"];
      }
    }
    return ["prod_1"];
  });

  useEffect(() => {
    localStorage.setItem("tshirt_reseller_price_alerts", JSON.stringify(priceAlertProductIds));
  }, [priceAlertProductIds]);

  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const getSharedAudioContext = (): AudioContext | null => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioContextClass();
      }
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  };

  const playNotificationChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = getSharedAudioContext();
      if (audioCtx) {
        const playTone = (freq: number, startTime: number, duration: number) => {
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, startTime);
          gainNode.gain.setValueAtTime(0.12, startTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          osc.start(startTime);
          osc.stop(startTime + duration);
          osc.onended = () => {
            osc.disconnect();
            gainNode.disconnect();
          };
        };
        const now = audioCtx.currentTime;
        playTone(523.25, now, 0.15); // C5
        playTone(659.25, now + 0.1, 0.15); // E5
        playTone(783.99, now + 0.2, 0.25); // G5
      }
    } catch (err) {
      console.warn("Chime failed:", err);
    }
  };

  const handleTogglePriceAlert = (product: Product) => {
    setPriceAlertProductIds((prev) => {
      const isSubscribed = prev.includes(product.id);
      const next = isSubscribed ? prev.filter((id) => id !== product.id) : [...prev, product.id];

      if (!isSubscribed) {
        const timestamp = new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });

        const newNotif: PushNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: "📉 Price Drop Alerts Active!",
          body: `You are now subscribed to automatic price change notifications for "${product.name}".`,
          productId: product.id,
          productName: product.name,
          timestamp,
        };

        setNotifications((prevNotifs) => [newNotif, ...prevNotifs]);
        playNotificationChime();
      }

      return next;
    });
  };

  const handleSimulatePriceDrop = (product: Product) => {
    const oldPrice = product.price;
    const discountedPrice = Math.max(10, Math.round(oldPrice * 0.85)); // 15% price cut

    // Update product price in state
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, price: discountedPrice } : p))
    );

    // If selected product is currently opened, update its price in state as well
    if (selectedProduct && selectedProduct.id === product.id) {
      setSelectedProduct((prev) => (prev ? { ...prev, price: discountedPrice } : null));
    }

    const timestamp = new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const newNotif: PushNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: "🔥 PRICE DROP ALERT!",
      body: `"${product.name}" dropped from ${currencySymbol}${oldPrice.toLocaleString()} to ${currencySymbol}${discountedPrice.toLocaleString()}! Limited time price event.`,
      productId: product.id,
      productName: product.name,
      timestamp,
    };

    setNotifications((prevNotifs) => [newNotif, ...prevNotifs]);
    playNotificationChime();

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("THREAD DEN - Price Drop Alert!", {
          body: `"${product.name}" is now on sale for ${currencySymbol}${discountedPrice}!`,
        });
      } catch (e) {
        console.warn("Native Notification failed:", e);
      }
    }
  };

  // Active Customer Filters
  const [selectedCollection, setSelectedCollection] = useState<"all" | "men" | "women">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const handleSelectCollection = (nextCollection: "all" | "men" | "women") => {
    setSelectedCollection(nextCollection);
    if (
      nextCollection === "men" &&
      selectedCategory !== "All" &&
      !MEN_CATEGORIES.includes(selectedCategory)
    ) {
      setSelectedCategory("All");
    } else if (
      nextCollection === "women" &&
      selectedCategory !== "All" &&
      !WOMEN_CATEGORIES.includes(selectedCategory)
    ) {
      setSelectedCategory("All");
    }
  };

  // Dynamic Catalog Price Range Calculation
  const catalogMinPrice = React.useMemo(() => {
    if (!products || products.length === 0) return 0;
    return Math.min(...products.map((p) => p.price));
  }, [products]);

  const catalogMaxPrice = React.useMemo(() => {
    if (!products || products.length === 0) return 3000;
    return Math.max(...products.map((p) => p.price));
  }, [products]);

  const [minPriceFilter, setMinPriceFilter] = useState<number>(0);
  const [maxPriceFilter, setMaxPriceFilter] = useState<number>(3000);

  // Auto-sync initial max price when products load
  const priceInitializedRef = useRef<boolean>(false);
  useEffect(() => {
    if (catalogMaxPrice > 0 && !priceInitializedRef.current) {
      setMinPriceFilter(catalogMinPrice);
      setMaxPriceFilter(catalogMaxPrice);
      priceInitializedRef.current = true;
    }
  }, [catalogMinPrice, catalogMaxPrice]);

  // Cart & UI Modal States
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState<boolean>(false);

  // Sync state modifications to LocalStorage safely
  useEffect(() => {
    safeWriteJson("tshirt_reseller_products", products);
  }, [products]);

  useEffect(() => {
    safeWriteJson("tshirt_reseller_orders", orders);
  }, [orders]);

  useEffect(() => {
    safeWriteJson("tshirt_reseller_calculator", calculator);
  }, [calculator]);

  // --- PUSH NOTIFICATION SIMULATOR STATE & LOGIC ---
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => {
    return typeof Notification !== "undefined" ? Notification.permission : "default";
  });

  // Track product stock alerts to avoid duplicate alerts
  const alertTriggeredRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    products.forEach((p) => {
      const isLow = p.stockCount < 2;
      const alreadyAlerted = alertTriggeredRef.current[p.id];

      if (isLow && !alreadyAlerted) {
        // Trigger alert!
        const timestamp = new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });

        const newNotif: PushNotification = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: "Low Stock Triggered!",
          body: `Product "${p.name}" has dropped below 2 units! Current stock is ${p.stockCount}. Prioritize restocking.`,
          productId: p.id,
          productName: p.name,
          timestamp,
        };

        setNotifications((prev) => [newNotif, ...prev]);

        // Synthesize a double-beep push notification audio chime via shared AudioContext
        if (soundEnabled) {
          try {
            const audioCtx = getSharedAudioContext();
            if (audioCtx) {
              const playChimeTone = (freq: number, startTime: number, duration: number) => {
                const osc = audioCtx.createOscillator();
                const gainNode = audioCtx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, startTime);
                gainNode.gain.setValueAtTime(0.12, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(gainNode);
                gainNode.connect(audioCtx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
                osc.onended = () => {
                  osc.disconnect();
                  gainNode.disconnect();
                };
              };
              const now = audioCtx.currentTime;
              playChimeTone(587.33, now, 0.15); // D5
              playChimeTone(880.00, now + 0.1, 0.25); // A5
            }
          } catch (err) {
            console.warn("Chime playback failed:", err);
          }
        }

        // Trigger native notification if granted
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("THREAD DEN - Low Stock!", {
              body: `"${p.name}" is down to ${p.stockCount} units.`,
            });
          } catch (e) {
            console.warn("Native Notification failed:", e);
          }
        }

        alertTriggeredRef.current[p.id] = true;
      } else if (!isLow && alreadyAlerted) {
        // Reset low stock alert trigger when restocked
        alertTriggeredRef.current[p.id] = false;
      }
    });
  }, [products, soundEnabled]);

  const handleDismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleQuickRestock = (productId: string) => {
    setProducts((prev) => {
      return prev.map((p) => {
        if (p.id === productId) {
          const nextStock = p.stockCount + 50;
          return {
            ...p,
            stockCount: nextStock,
            isAvailable: nextStock > 0,
          };
        }
        return p;
      });
    });
  };

  const handleViewProductStock = (productId: string) => {
    if (!isAdminAuthenticated) {
      setIsAuthModalOpen(true);
      return;
    }
    setCurrentMode("merchant");
    // Scrolls smoothly to the inventory section inside merchant portal
    setTimeout(() => {
      const el = document.getElementById("inventory-management-table") || document.getElementById("merchant-dashboard-view");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleRequestNotificationPermission = () => {
    if (typeof Notification !== "undefined") {
      Notification.requestPermission().then((status) => {
        setPermissionStatus(status);
      });
    }
  };

  // Synchronize product prices if the merchant updates the wholesale target retail price
  const handleUpdateCalculator = (newCalc: ResellerCalculator) => {
    setCalculator(newCalc);
    // Optionally update default pricing across standard products
    const updatedProducts = products.map((p) => {
      // If it is one of our default products, update its pricing structure
      if (p.id.startsWith("prod_")) {
        return { ...p, price: newCalc.targetRetailPrice };
      }
      return p;
    });
    setProducts(updatedProducts);
  };

  const handleUpdateBrandConfig = (newBrand: string, newWhatsApp: string) => {
    setBrandName(newBrand);
    setMerchantWhatsApp(newWhatsApp);
    localStorage.setItem("tshirt_reseller_brand", newBrand);
    localStorage.setItem("tshirt_reseller_whatsapp", newWhatsApp);
  };

  // Synchronize article updates, additions and removals with Firestore database
  const handleUpdateProducts = async (updated: Product[]) => {
    setProducts(updated);

    try {
      const updatedIds = new Set(updated.map((p) => p.id));
      // Delete any article removed in the Merchant Hub
      for (const prevP of products) {
        if (!updatedIds.has(prevP.id)) {
          await deleteProductDoc(prevP.id);
        }
      }
      // Save/persist all updated and newly created articles in Firestore database
      for (const p of updated) {
        await saveProductDoc(p);
      }
    } catch (err) {
      console.error("Error saving updated articles to Firestore database:", err);
    }
  };

  // Synchronize user profile updates, saved addresses, and bank details with Firestore database
  const handleUpdateUser = async (updatedUser: UserProfile) => {
    setCurrentUser(updatedUser);
    try {
      await saveUserProfile(updatedUser);
      console.log("Updated user account profile in Firestore database:", updatedUser.name);
    } catch (err) {
      console.error("Error saving user profile to Firestore database:", err);
    }
  };

  // --- 2. SHOPPING CART LOGIC ---
  const handleAddToCart = (
    product: Product,
    size: string,
    color: { name: string; hex: string },
    quantity: number
  ) => {
    const compositeId = `${product.id}_${size}_${color.name}`;
    
    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((item) => item.id === compositeId);
      
      if (existingIndex > -1) {
        const updated = [...prevCart];
        updated[existingIndex].quantity += quantity;
        return updated;
      } else {
        const newItem: CartItem = {
          id: compositeId,
          product,
          selectedSize: size,
          selectedColor: color,
          quantity,
        };
        return [...prevCart, newItem];
      }
    });
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return { ...item, quantity: nextQty };
          }
          return item;
        })
        .filter((item) => item.quantity > 0);
    });
  };

  const handleRemoveCartItem = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
  };

  // Order Submission & Cart Clearance
  const handleOrderSubmitted = (
    orderData: Omit<Order, "id" | "createdAt" | "status"> & {
      id?: string;
      createdAt?: string;
      status?: Order["status"];
    }
  ) => {
    const orderId = orderData.id || `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const newOrder: Order = {
      ...orderData,
      id: orderId,
      createdAt:
        orderData.createdAt ||
        new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      status: orderData.status || "pending",
    };

    setOrders((prev) => [newOrder, ...prev]);
    // Persist new order to Firestore database
    saveOrderDoc(newOrder).catch((e) => console.error("Error persisting order to Firestore:", e));

    // Deduct from Stock Count
    setProducts((prevProducts) => {
      return prevProducts.map((p) => {
        const orderedItem = orderData.items.find((item) => item.productId === p.id);
        if (orderedItem) {
          const nextStock = Math.max(0, p.stockCount - orderedItem.quantity);
          // Persist stock count in Firestore database
          updateProductStockDoc(p.id, nextStock).catch(console.error);
          return {
            ...p,
            stockCount: nextStock,
            isAvailable: nextStock > 0,
          };
        }
        return p;
      });
    });

    // Clear cart upon successful reservation
    setCart([]);

    const isCod = orderData.paymentChannel === "cod" || orderData.paymentStatus === "unpaid";

    // Push Notification alert for Order & Multi-channel Confirmation Dispatch
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: isCod
          ? "COD Order Confirmed & Sample Bill Sent"
          : "Razorpay Payment Complete & Sample Bill Sent",
        body: `Order #${orderId} (${currencySymbol}${orderData.totalAmount}) for ${orderData.customerName}. Sample bill ${orderData.billNumber || ""} sent to ${orderData.customerEmail || orderData.customerPhone}.`,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
  };

  // Record customer details into user profile in Firestore when clicking Buy Now
  const handleRecordCustomerDetails = (details: {
    name: string;
    phone: string;
    email: string;
    deliveryMethod: "pickup" | "delivery";
    address?: string;
  }) => {
    if (!currentUser) return;
    const existingAddresses = currentUser.savedAddresses || [];
    let updatedAddresses = existingAddresses;

    if (details.deliveryMethod === "delivery" && details.address) {
      const normalized = details.address.trim().toLowerCase();
      const alreadySaved = existingAddresses.some((a) =>
        `${a.streetAddress}, ${a.city}, ${a.state} - ${a.postalCode}`.toLowerCase() === normalized ||
        a.streetAddress.toLowerCase() === normalized
      );
      if (!alreadySaved) {
        updatedAddresses = [
          {
            id: `addr_${Date.now()}`,
            label: "Checkout Address",
            fullName: details.name,
            phone: details.phone,
            streetAddress: details.address,
            city: "",
            state: "",
            postalCode: "",
            isDefault: existingAddresses.length === 0,
          },
          ...existingAddresses,
        ];
      }
    }

    handleUpdateUser({
      ...currentUser,
      name: details.name || currentUser.name,
      phone: details.phone || currentUser.phone,
      email: details.email || currentUser.email,
      savedAddresses: updatedAddresses,
    });
  };

  // Persist WhatsApp / SMS / Email / Bill dispatch results onto an order
  const handleUpdateOrderDispatch = (orderId: string, dispatchStatus: Order["dispatchStatus"]) => {
    if (!dispatchStatus) return;
    setOrders((prevOrders) =>
      prevOrders.map((o) => {
        if (o.id === orderId) {
          const updatedOrder: Order = { ...o, dispatchStatus };
          saveOrderDoc(updatedOrder).catch((e) =>
            console.error("Error persisting dispatchStatus to Firestore:", e)
          );
          return updatedOrder;
        }
        return o;
      })
    );
  };

  // Persist order status updates made inside MerchantPortal to Firestore
  const handleUpdateOrders = (updatedOrders: Order[]) => {
    setOrders(updatedOrders);
    updatedOrders.forEach((ord) => {
      const prev = orders.find((p) => p.id === ord.id);
      if (!prev || prev.status !== ord.status || prev.dispatchStatus !== ord.dispatchStatus) {
        saveOrderDoc(ord).catch((e) => console.error("Error syncing order update to Firestore:", e));
      }
    });
  };

  // Order Cancellation & Stock Restock Handler
  const handleCancelOrder = (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder) return;

    if (targetOrder.status !== "pending") {
      alert(`Order ${orderId} cannot be cancelled as it is already ${targetOrder.status}.`);
      return;
    }

    const cancelledOrder: Order = { ...targetOrder, status: "cancelled" };

    // 1. Update Order Status to 'cancelled' and sync to Firestore
    setOrders((prevOrders) =>
      prevOrders.map((o) => (o.id === orderId ? cancelledOrder : o))
    );
    saveOrderDoc(cancelledOrder).catch(console.error);

    // 2. Add items back to product inventory stock and Firestore
    setProducts((prevProducts) => {
      return prevProducts.map((p) => {
        const cancelledItems = targetOrder.items.filter((item) => item.productId === p.id);
        if (cancelledItems.length > 0) {
          const returnedQty = cancelledItems.reduce((sum, item) => sum + item.quantity, 0);
          const nextStock = p.stockCount + returnedQty;
          updateProductStockDoc(p.id, nextStock).catch(console.error);
          return {
            ...p,
            stockCount: nextStock,
            isAvailable: nextStock > 0,
          };
        }
        return p;
      });
    });

    // 3. Dispatch Push Notification
    setNotifications((prev) => [
      {
        id: `notif-${Date.now()}`,
        title: "Order Cancelled & Restocked",
        body: `Order ${orderId} was cancelled. Inventory items were added back to stock count.`,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
  };

  // --- 3. FILTER LOGIC & COLLECTION SEPARATION FOR CUSTOMERS ---
  const activeCategoryTabs =
    selectedCollection === "men"
      ? ["All", ...MEN_CATEGORIES]
      : selectedCollection === "women"
      ? ["All", ...WOMEN_CATEGORIES]
      : CATEGORIES;

  const filteredProducts = products.filter((p) => {
    const col = inferProductCollection(p);
    const matchCollection = selectedCollection === "all" || col === selectedCollection;
    const matchCategory = selectedCategory === "All" || p.category === selectedCategory;
    const matchSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchPrice = p.price >= minPriceFilter && p.price <= maxPriceFilter;
    return matchCollection && matchCategory && matchSearch && matchPrice;
  });

  const mensProducts = filteredProducts.filter((p) => inferProductCollection(p) === "men");
  const womensProducts = filteredProducts.filter((p) => inferProductCollection(p) === "women");

  const cartTotalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className={`min-h-screen transition-colors duration-300 flex flex-col font-sans selection:bg-zinc-950 selection:text-white ${
      isDark ? "bg-zinc-950 text-zinc-100" : "bg-slate-50 text-zinc-950"
    }`}>
      {showIntroSplash && (
        <IntroSplash
          brandName={brandName}
          durationMs={5000}
          onComplete={() => setShowIntroSplash(false)}
        />
      )}
      
      {/* Universal Sticky Header Navigation */}
      <Header
        brandName={brandName}
        currencySymbol={currencySymbol}
        currentMode={currentMode}
        onModeChange={handleModeChange}
        cart={cart}
        onOpenCart={() => setIsCartOpen(true)}
        theme={theme}
        onThemeToggle={toggleTheme}
        currentUser={currentUser}
        onOpenAccountModal={() => {
          if (currentUser) {
            setIsAccountOpen(true);
          } else {
            setIsAuthModalOpen(true);
          }
        }}
        isAdminAuthenticated={isAdminAuthenticated}
        onAdminSignOut={handleAdminSignOut}
      />

      <main className="flex-grow">
        {currentMode === "customer" ? (
          /* ================= CUSTOMER VIEWPORT ================= */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Elegant Hero Visual Section with Trending Slideshow */}
            <Hero
              brandName={brandName}
              theme={theme}
              products={products}
              currencySymbol={currencySymbol}
              onSelectProduct={(product) => setSelectedProduct(product)}
            />

            {/* Catalog Filter controls */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
                isDark ? "border-zinc-900" : "border-zinc-200/60"
              }`}>
                <div>
                  <h2 className={`font-display font-bold text-2xl ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {selectedCollection === "men"
                      ? "Men's Collection"
                      : selectedCollection === "women"
                      ? "Women's Collection"
                      : "Dedicated Men's & Women's Collections"}
                  </h2>
                  <p className="text-zinc-500 text-xs mt-1">
                    Men&apos;s and Women&apos;s lines curated separately — oversized streetwear, polos &amp; shirts for Men, and sarees, chudidhars &amp; western cuts for Women.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Separated Collection Switcher */}
                  <div
                    className={`inline-flex p-1 rounded-xl border ${
                      isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200 shadow-xs"
                    }`}
                    id="collection-switcher-bar"
                  >
                    {([
                      { id: "all", label: "All Collections" },
                      { id: "men", label: "Men's" },
                      { id: "women", label: "Women's" },
                    ] as const).map((tab) => {
                      const active = selectedCollection === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleSelectCollection(tab.id)}
                          id={`collection-tab-${tab.id}`}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            active
                              ? tab.id === "women"
                                ? "bg-rose-500 text-white shadow-xs"
                                : tab.id === "men"
                                ? "bg-sky-500 text-zinc-950 shadow-xs"
                                : "bg-emerald-500 text-zinc-950 shadow-xs"
                              : isDark
                              ? "text-zinc-400 hover:text-white"
                              : "text-zinc-600 hover:text-zinc-950"
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Filter Button */}
                  <button
                    type="button"
                    onClick={() => setIsFilterModalOpen(true)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 shadow-xs cursor-pointer ${
                      (selectedCollection !== "all" || selectedCategory !== "All" || minPriceFilter > catalogMinPrice || maxPriceFilter < catalogMaxPrice)
                        ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-400 shadow-emerald-500/10"
                        : isDark
                        ? "bg-zinc-900 hover:bg-zinc-850 text-white border-zinc-800"
                        : "bg-white hover:bg-zinc-50 text-zinc-900 border-zinc-200"
                    }`}
                    id="open-filter-btn"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Filter</span>
                    {(selectedCollection !== "all" || selectedCategory !== "All" || minPriceFilter > catalogMinPrice || maxPriceFilter < catalogMaxPrice) && (
                      <span className="w-5 h-5 rounded-full bg-zinc-950 text-white font-mono text-[10px] flex items-center justify-center font-bold">
                        {(selectedCollection !== "all" ? 1 : 0) + (selectedCategory !== "All" ? 1 : 0) + (minPriceFilter > catalogMinPrice || maxPriceFilter < catalogMaxPrice ? 1 : 0)}
                      </span>
                    )}
                  </button>

                  {/* Live Search bar */}
                  <div className="relative max-w-xs w-full sm:w-56">
                    <input
                      type="text"
                      placeholder="Search styles, fits, sarees..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full px-4 py-2 text-xs border rounded-xl outline-none focus:ring-1 transition-all font-medium ${
                        isDark 
                          ? "bg-zinc-900 border-zinc-800 text-white focus:border-zinc-600 focus:ring-zinc-600" 
                          : "bg-white border-zinc-200 text-zinc-950 focus:border-zinc-950 focus:ring-zinc-950"
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Category Navigation Tabs (Scoped to Selected Collection) */}
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => categoryRailRef.current?.scrollBy({ left: -240, behavior: "smooth" })}
                  aria-label="Scroll categories left"
                  className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-xl border shrink-0 transition-all cursor-pointer ${
                    isDark
                      ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:border-zinc-300 shadow-3xs"
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div
                  ref={categoryRailRef}
                  className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth flex-1 py-0.5"
                >
                  {activeCategoryTabs.map((cat) => {
                    const isActive = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        id={`quick-cat-tab-${cat.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                          isActive
                            ? isDark
                              ? "bg-emerald-500 text-zinc-950 border-emerald-400 shadow-sm"
                              : "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                            : isDark
                            ? "bg-zinc-900/70 hover:bg-zinc-850 text-zinc-300 border-zinc-800"
                            : "bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => categoryRailRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
                  aria-label="Scroll categories right"
                  className={`hidden sm:flex items-center justify-center w-8 h-8 rounded-xl border shrink-0 transition-all cursor-pointer ${
                    isDark
                      ? "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
                      : "bg-white border-zinc-200 text-zinc-600 hover:text-zinc-950 hover:border-zinc-300 shadow-3xs"
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Active Filter Pills Bar */}
              {(selectedCollection !== "all" || selectedCategory !== "All" || minPriceFilter > catalogMinPrice || maxPriceFilter < catalogMaxPrice) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 pb-1 animate-in fade-in duration-200">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold mr-1">
                    Active Filters:
                  </span>

                  {selectedCollection !== "all" && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      isDark ? "bg-zinc-900 border-zinc-800 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}>
                      <span>Collection: {selectedCollection === "men" ? "Men's" : "Women's"}</span>
                      <button
                        onClick={() => handleSelectCollection("all")}
                        className="p-0.5 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Show both collections"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedCategory !== "All" && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      isDark ? "bg-zinc-900 border-zinc-800 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}>
                      <span>Category: {selectedCategory}</span>
                      <button
                        onClick={() => setSelectedCategory("All")}
                        className="p-0.5 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Remove category filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {(minPriceFilter > catalogMinPrice || maxPriceFilter < catalogMaxPrice) && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                      isDark ? "bg-zinc-900 border-zinc-800 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                    }`}>
                      <span>Price: {currencySymbol}{minPriceFilter.toLocaleString()} – {currencySymbol}{maxPriceFilter.toLocaleString()}</span>
                      <button
                        onClick={() => {
                          setMinPriceFilter(catalogMinPrice);
                          setMaxPriceFilter(catalogMaxPrice);
                        }}
                        className="p-0.5 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Remove price filter"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  <button
                    onClick={() => {
                      handleSelectCollection("all");
                      setSelectedCategory("All");
                      setMinPriceFilter(catalogMinPrice);
                      setMaxPriceFilter(catalogMaxPrice);
                    }}
                    className="text-xs text-zinc-400 hover:text-emerald-500 font-mono font-bold underline ml-2 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {/* Separated Collection Grids */}
              {filteredProducts.length === 0 ? (
                <div className={`text-center py-16 border rounded-3xl space-y-4 p-6 ${
                  isDark ? "bg-zinc-900 border-zinc-850" : "bg-white border-zinc-200/60"
                }`}>
                  <div className={`w-12 h-12 border rounded-full flex items-center justify-center mx-auto ${
                    isDark ? "bg-zinc-950 border-zinc-800 text-zinc-400" : "bg-zinc-50 border-zinc-150 text-zinc-400"
                  }`}>
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="space-y-1">
                    <h3 className={`font-display font-bold text-sm ${isDark ? "text-white" : "text-zinc-800"}`}>No items match your collection or search filters</h3>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto">
                      No articles fit within {currencySymbol}{minPriceFilter.toLocaleString()} – {currencySymbol}{maxPriceFilter.toLocaleString()} for this filter. Try switching collections or resetting filters.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      handleSelectCollection("all");
                      setSelectedCategory("All");
                      setMinPriceFilter(catalogMinPrice);
                      setMaxPriceFilter(catalogMaxPrice);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-zinc-950 hover:bg-emerald-400 transition-all shadow-sm"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="space-y-12">
                  {/* MEN'S COLLECTION SECTION */}
                  {(selectedCollection === "all" || selectedCollection === "men") && mensProducts.length > 0 && (
                    <section id="mens-collection-section" className="space-y-5">
                      <div className={`flex items-center justify-between gap-3 pb-3 border-b ${
                        isDark ? "border-zinc-800/80" : "border-zinc-200"
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400 font-mono text-[10px] font-black uppercase tracking-wider">
                            Men&apos;s Edit
                          </span>
                          <div>
                            <h3 className={`font-display font-black text-lg sm:text-xl ${isDark ? "text-white" : "text-zinc-900"}`}>
                              Men&apos;s Collection
                            </h3>
                            <p className="text-xs text-zinc-500">
                              Oversized &amp; Drop Shoulder tees, Acid Wash, Jersey, Polos &amp; Men&apos;s Shirts
                            </p>
                          </div>
                        </div>
                        <span className={`font-mono text-xs font-bold px-3 py-1 rounded-full border ${
                          isDark ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-700"
                        }`}>
                          {mensProducts.length} Styles
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {mensProducts.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            currencySymbol={currencySymbol}
                            onSelect={(product) => setSelectedProduct(product)}
                            onVisualizeWithAiStylist={(product, color, view) => handleOpenStylist(product, color, view)}
                            isWishlisted={wishlistProductIds.includes(p.id)}
                            onToggleWishlist={handleToggleWishlist}
                            theme={theme}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* WOMEN'S COLLECTION SECTION */}
                  {(selectedCollection === "all" || selectedCollection === "women") && womensProducts.length > 0 && (
                    <section id="womens-collection-section" className="space-y-5">
                      <div className={`flex items-center justify-between gap-3 pb-3 border-b ${
                        isDark ? "border-zinc-800/80" : "border-zinc-200"
                      }`}>
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 font-mono text-[10px] font-black uppercase tracking-wider">
                            Women&apos;s Edit
                          </span>
                          <div>
                            <h3 className={`font-display font-black text-lg sm:text-xl ${isDark ? "text-white" : "text-zinc-900"}`}>
                              Women&apos;s Collection
                            </h3>
                            <p className="text-xs text-zinc-500">
                              Handloom Sarees, Chididhar Sets &amp; Women&apos;s Cropped / Relaxed Western Cuts
                            </p>
                          </div>
                        </div>
                        <span className={`font-mono text-xs font-bold px-3 py-1 rounded-full border ${
                          isDark ? "bg-zinc-900 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-700"
                        }`}>
                          {womensProducts.length} Styles
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {womensProducts.map((p) => (
                          <ProductCard
                            key={p.id}
                            product={p}
                            currencySymbol={currencySymbol}
                            onSelect={(product) => setSelectedProduct(product)}
                            onVisualizeWithAiStylist={(product, color, view) => handleOpenStylist(product, color, view)}
                            isWishlisted={wishlistProductIds.includes(p.id)}
                            onToggleWishlist={handleToggleWishlist}
                            theme={theme}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>

            {/* Customer Reviews Section (Live Firestore + Profile Display) */}
            <Testimonials
              theme={theme}
              reviews={reviews}
              users={registeredUsers}
              products={products}
              onSelectProduct={(product) => setSelectedProduct(product)}
            />

            {/* Floating AI Stylist Miniature Studio Launcher (Right Side) */}
            <div className="fixed bottom-6 right-6 z-40 animate-in slide-in-from-bottom-6 duration-300">
              <button
                type="button"
                onClick={() => handleOpenStylist()}
                className={`font-display font-bold text-xs py-3.5 px-5 rounded-full shadow-2xl flex items-center gap-2 ring-2 transition-transform active:scale-95 cursor-pointer ${
                  isDark
                    ? "bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-zinc-950 font-black ring-emerald-400/40 shadow-emerald-500/25"
                    : "bg-zinc-950 hover:bg-zinc-800 text-white ring-zinc-900 shadow-xl"
                }`}
                id="floating-ai-stylist-trigger-btn"
                title="Open AI Stylist Virtual Miniature Try-On Studio"
              >
                <Sparkles className="w-4 h-4 fill-zinc-950 text-zinc-950 animate-pulse" />
                <span>AI Stylist (Try-On)</span>
              </button>
            </div>

            {/* Float Cart indicator (Mobile checkout trigger helper - positioned above AI Stylist) */}
            {cartTotalCount > 0 && (
              <div className="fixed bottom-20 right-6 z-40 animate-in slide-in-from-bottom-6 duration-300">
                <button
                  onClick={() => setIsCartOpen(true)}
                  className={`font-display font-bold text-xs py-3 px-5 rounded-full shadow-xl flex items-center gap-2 ring-4 transition-transform active:scale-95 cursor-pointer ${
                    isDark 
                      ? "bg-white hover:bg-zinc-200 text-zinc-950 ring-zinc-900" 
                      : "bg-zinc-950 hover:bg-zinc-800 text-white ring-white"
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  View Custom Order ({cartTotalCount})
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : isAdminAuthenticated ? (
          /* ================= MERCHANT HUB VIEWPORT (ADMIN ONLY) ================= */
          <div className="animate-in fade-in duration-300">
            <Suspense fallback={null}>
              <MerchantPortal
                products={products}
                orders={orders}
                calculator={calculator}
                brandPartners={brandPartners}
                reviews={reviews}
                registeredUsers={registeredUsers}
                onUpdateBrandPartners={(updated) => setBrandPartners(updated)}
                currencySymbol={currencySymbol}
                brandName={brandName}
                merchantWhatsApp={merchantWhatsApp}
                onUpdateProducts={handleUpdateProducts}
                onUpdateOrders={handleUpdateOrders}
                onUpdateOrderDispatch={handleUpdateOrderDispatch}
                onUpdateCalculator={handleUpdateCalculator}
                onUpdateBrandConfig={handleUpdateBrandConfig}
                onSaveReview={saveReviewDoc}
                onDeleteReview={deleteReviewDoc}
                theme={theme}
              />
            </Suspense>
          </div>
        ) : null}
      </main>

      {/* Main Responsive Footer */}
      <Footer
        brandName={brandName}
        merchantWhatsApp={merchantWhatsApp}
        theme={theme}
        onOpenAccountModal={() => {
          if (currentUser) {
            setIsAccountOpen(true);
          } else {
            setIsAuthModalOpen(true);
          }
        }}
        onOpenMerchantPortal={() => handleModeChange("merchant")}
      />

      {/* SINGLE UNIFIED LOGIN / SIGN UP MODAL (CUSTOMER DEFAULT + ADMIN TOGGLE) */}
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={() => {
              setIsAuthModalOpen(false);
              setAuthModalCheckoutContext(null);
            }}
            onCustomerLogin={handleCustomerLogin}
            onAdminLogin={handleAdminSuccess}
            theme={theme}
            brandName={brandName}
            initialRole="customer"
            initialCustomerMode={authModalInitialMode}
            checkoutContext={authModalCheckoutContext}
          />
        </Suspense>
      )}

      {selectedProduct && (
        <Suspense fallback={null}>
          <ProductDetailModal
            product={selectedProduct}
            currencySymbol={currencySymbol}
            onClose={() => setSelectedProduct(null)}
            onAddToCart={handleAddToCart}
            onBuyNow={(product, size, color, quantity) => {
              handleAddToCart(product, size, color, quantity);
              setIsCartOpen(true);
            }}
            onVisualizeWithAiStylist={(product, color, view) => handleOpenStylist(product, color, view)}
            theme={theme}
            isPriceAlertSubscribed={selectedProduct ? priceAlertProductIds.includes(selectedProduct.id) : false}
            onTogglePriceAlert={handleTogglePriceAlert}
            onSimulatePriceDrop={handleSimulatePriceDrop}
          />
        </Suspense>
      )}

      {isCartOpen && (
        <Suspense fallback={null}>
          <CartSidebar
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            cart={cart}
            onUpdateQuantity={handleUpdateCartQuantity}
            onRemoveItem={handleRemoveCartItem}
            currencySymbol={currencySymbol}
            brandName={brandName}
            merchantWhatsApp={merchantWhatsApp}
            onSubmitOrder={handleOrderSubmitted}
            onUpdateOrderDispatch={handleUpdateOrderDispatch}
            onRecordCustomerDetails={handleRecordCustomerDetails}
            theme={theme}
            currentUser={currentUser}
            onOpenAccountModal={() => {
              if (currentUser) {
                setIsAccountOpen(true);
              } else {
                setAuthModalInitialMode("signin");
                setAuthModalCheckoutContext(null);
                setIsAuthModalOpen(true);
              }
            }}
            onOpenAuthModal={(mode) => {
              const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
              setAuthModalInitialMode(mode);
              setAuthModalCheckoutContext({
                itemCount: cartTotalCount,
                totalAmount: subtotal,
                currencySymbol: currencySymbol,
              });
              setIsAuthModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {isFilterModalOpen && (
        <Suspense fallback={null}>
          <FilterModal
            isOpen={isFilterModalOpen}
            onClose={() => setIsFilterModalOpen(false)}
            selectedCollection={selectedCollection}
            onSelectCollection={handleSelectCollection}
            categories={activeCategoryTabs}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            minPrice={minPriceFilter}
            maxPrice={maxPriceFilter}
            catalogMinPrice={catalogMinPrice}
            catalogMaxPrice={catalogMaxPrice}
            onChangeMinPrice={setMinPriceFilter}
            onChangeMaxPrice={setMaxPriceFilter}
            onResetFilters={() => {
              handleSelectCollection("all");
              setSelectedCategory("All");
              setMinPriceFilter(catalogMinPrice);
              setMaxPriceFilter(catalogMaxPrice);
            }}
            currencySymbol={currencySymbol}
            theme={theme}
            productCount={filteredProducts.length}
            totalProductCount={products.length}
          />
        </Suspense>
      )}

      {isAccountOpen && (
        <Suspense fallback={null}>
          <AccountModal
            isOpen={isAccountOpen}
            onClose={() => setIsAccountOpen(false)}
            currentUser={currentUser}
            onLogin={(user) => handleCustomerLogin(user)}
            onLogout={() => {
              setCurrentUser(null);
              setNotifications((prev) => [
                {
                  id: `notif_${Date.now()}`,
                  title: "👋 Signed Out",
                  body: "You have signed out of your customer account.",
                  timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
                },
                ...prev,
              ]);
            }}
            onUpdateUser={handleUpdateUser}
            userOrders={orders}
            currencySymbol={currencySymbol}
            merchantWhatsApp={merchantWhatsApp}
            theme={theme}
            wishlistProductIds={wishlistProductIds}
            allProducts={products}
            onToggleWishlist={handleToggleWishlist}
            onSelectProduct={(product) => setSelectedProduct(product)}
            onCancelOrder={handleCancelOrder}
            onAdminLogin={() => setIsAuthModalOpen(true)}
            brandName={brandName}
          />
        </Suspense>
      )}

      {/* Push Notification Simulator */}
      <PushNotificationCenter
        notifications={notifications}
        onDismiss={handleDismissNotification}
        onRestock={handleQuickRestock}
        onView={handleViewProductStock}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        permissionStatus={permissionStatus}
        onRequestPermission={handleRequestNotificationPermission}
      />

      {/* AI Stylist & Miniature Virtual Try-On Studio */}
      {isStylistOpen && (
        <Suspense fallback={null}>
          <AiStylistModal
            isOpen={isStylistOpen}
            onClose={() => setIsStylistOpen(false)}
            products={products}
            selectedProduct={stylistTargetProduct}
            onSelectProduct={(p) => setStylistTargetProduct(p)}
            onAddToCart={handleAddToCart}
            theme={theme}
            currencySymbol={currencySymbol}
            brandName={brandName}
            initialColor={stylistTargetColor}
            initialView={stylistTargetView}
          />
        </Suspense>
      )}
    </div>
  );
}
