export interface BrandPartner {
  id: string;
  name: string;
  shopName?: string;
  contactPerson: string;
  phone: string;
  email: string;
  whatsapp: string;
  location: string;
  websiteOrCatalogUrl?: string;
  leadTimeDays: number;
  minimumOrderQty: number;
  marginSplitPercent?: number; // e.g. 60% reseller, 40% brand
  notes?: string;
  logoUrl?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number; // Wholesale/Import cost from the supplier / brand
  price: number;     // Reselling price to customers
  category: string;  // e.g., "Oversized Blanks", "Graphic Tees", "Heavyweight Basics"
  images: string[];
  backImage?: string; // Photo 2 for back prints (Oversized, Drop Shoulder, Polo, etc.)
  colors: { name: string; hex: string; image?: string; imageUrl?: string; backImage?: string }[];
  colorImages?: Record<string, string>;
  sizes: string[];
  isAvailable: boolean;
  stockCount: number;
  // Collaborating brand & on-demand sourcing fields
  brandId?: string;
  brandName?: string;
  brandShopName?: string;
  brandContactPerson?: string;
  brandPhone?: string;
  brandWhatsapp?: string;
  brandLocation?: string;
  brandEmail?: string;
  sku?: string;
  initialStock?: number;
  sourcingLeadTime?: string;
  isFeatured?: boolean; // When true, displayed in storefront Hero Trending / Latest Collection slideshow
}

export interface CartItem {
  id: string; // Composite key: productId_size_color
  product: Product;
  selectedSize: string;
  selectedColor: { name: string; hex: string };
  quantity: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  size: string;
  color: string;
  price: number;
  quantity: number;
  brandId?: string;
  brandName?: string;
}

export interface SavedAddress {
  id: string;
  label: string; // e.g. "Home", "Studio / Work", "Depot"
  fullName: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

export interface BankDetails {
  upiId?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  cardHolderName?: string;
  cardLast4?: string;
  cardExpiry?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone: string;
  password?: string;
  avatarUrl?: string;
  createdAt: string;
  savedAddresses: SavedAddress[];
  bankDetails: BankDetails;
  wishlistProductIds?: string[];
  isAdmin?: boolean;
}

export interface AdminAccount {
  id: string;
  username: string;
  password: string;
  role: "admin";
  createdAt: string;
}

export interface CustomerMiniature {
  id: string;
  name: string;
  userPhotoUrl: string; // The uploaded/taken customer selfie/portrait photo
  miniatureImageUrl: string; // The generated miniature avatar/figurine image
  isAiGenerated?: boolean; // true when miniatureImageUrl is an AI-generated figurine of the customer
  imageModel?: string; // image model that produced the figurine
  style: "streetwear_vinyl" | "anime_chibi" | "realistic_scale";
  build: "regular" | "athletic" | "oversized_loose";
  skinTone?: string;
  hairStyle?: string;
  hairColor?: string;
  facialVibe?: string;
  outfitAttire?: "western_tee" | "western_shirt" | "saree" | "chudidhar";
  recommendedArchetype?:
    | "chibi_male"
    | "chibi_fem"
    | "chibi_urban"
    | "chibi_reference"
    | "chibi_saree"
    | "chibi_chudidhar"
    | "chibi_women_western";
  createdAt: string;
  stylingNotes?: string;
}

export interface StylistFitVerdict {
  fitScore: number; // 0 - 100
  matchLevel: string;
  silhouetteDrape: string;
  colorSynergy: string;
  stylistAdvice: string;
  recommendedPairings: {
    bottoms: string;
    footwear: string;
    accessories: string;
  };
  isEstimate?: boolean; // true when AI was unavailable and this is a generic estimate
  basedOnPreview?: boolean; // true when the verdict was made by looking at the try-on image
}

export interface NotificationChannelStatus {
  channel: "whatsapp" | "sms" | "email" | "bill_email";
  delivered: boolean;
  mode: "api" | "fallback_link";
  provider: string;
  recipient: string;
  reason?: string;
  messageId?: string;
  fallbackUrl?: string;
  timestamp: string;
}

export interface OrderDispatchStatus {
  dispatchedAt: string;
  pdfGenerated?: boolean;
  pdfFilename?: string;
  pdfUrl?: string;
  whatsappText?: string;
  whatsapp: NotificationChannelStatus;
  sms: NotificationChannelStatus;
  email: NotificationChannelStatus;
  billEmail: NotificationChannelStatus;
}

export interface Order {
  id: string;
  userId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerAddress?: string;
  deliveryMethod: "pickup" | "delivery";
  items: OrderItem[];
  totalAmount: number;
  status: "pending" | "confirmed" | "processing" | "shipped" | "completed" | "cancelled";
  createdAt: string;
  paymentMethod?: string;
  paymentChannel?: "cod" | "upi" | "card";
  paymentStatus?: "unpaid" | "paid";
  transactionId?: string;
  billNumber?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  razorpayMeUrl?: string;
  gatewayConfirmedAt?: string;
  pdfUrl?: string;
  pdfFilename?: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
  dispatchStatus?: OrderDispatchStatus;
}

export interface ResellerCalculator {
  batchSize: number;         // Total t-shirts imported in this batch
  unitWholesaleCost: number; // Cost per t-shirt paid to the supplier
  shippingCostTotal: number; // Logistics, customs, freight
  customsDutyTotal: number;  // Import tax / customs clearing
  packagingCostPerUnit: number; // Polybags, neck tags, custom stickers
  marketingCostTotal: number; // Promos, ads, flyers
  targetRetailPrice: number; // Price to resell each shirt for
}

export interface CustomerReview {
  id: string;
  reviewerName: string;
  reviewerEmail?: string;
  reviewerPhone?: string;
  matchedUserId?: string;
  reviewerAvatar?: string;
  roleOrCompany?: string;
  productId?: string;
  productName?: string;
  rating: number;
  highlight: string;
  content: string;
  createdAt: string;
}
