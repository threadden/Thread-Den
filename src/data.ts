import { Product, ResellerCalculator, Order, BrandPartner } from "./types";

export const DEFAULT_BRAND_PARTNERS: BrandPartner[] = [
  {
    id: "brand_kult",
    name: "Kult Streetwear Co.",
    shopName: "Kult Flagship Bandra",
    contactPerson: "Arjun Singhania",
    phone: "+91 98201 12345",
    whatsapp: "+91 98201 12345",
    email: "orders@kultstreetwear.in",
    location: "Bandra West, Mumbai",
    websiteOrCatalogUrl: "https://kultstreetwear.in/wholesale",
    leadTimeDays: 3,
    minimumOrderQty: 20,
    marginSplitPercent: 60,
    notes: "Specializes in oversized printed architectural graphics & water-based screen printing.",
    logoUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=200",
  },
  {
    id: "brand_acidcraft",
    name: "Acid Craft Studios",
    shopName: "Acid Craft Tirupur Hub",
    contactPerson: "Kavita Rao",
    phone: "+91 98450 67890",
    whatsapp: "+91 98450 67890",
    email: "supply@acidcraftstudios.com",
    location: "Tirupur, Tamil Nadu",
    websiteOrCatalogUrl: "https://acidcraftstudios.com",
    leadTimeDays: 4,
    minimumOrderQty: 25,
    marginSplitPercent: 55,
    notes: "Direct mill dye house specializing in mineral acid wash and distressed 280GSM weaves.",
    logoUrl: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=200",
  },
  {
    id: "brand_rawbasics",
    name: "Raw Cotton Lab",
    shopName: "Raw Denim & Heavy Cotton Lab",
    contactPerson: "Nikhil Menon",
    phone: "+91 99002 34567",
    whatsapp: "+91 99002 34567",
    email: "b2b@rawdenimlab.in",
    location: "Indiranagar, Bengaluru",
    websiteOrCatalogUrl: "https://rawcottonlab.in",
    leadTimeDays: 5,
    minimumOrderQty: 30,
    marginSplitPercent: 65,
    notes: "High-grade 240+ GSM combed plain streetwear blanks with double-stitched tight crew collars.",
    logoUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=200",
  },
  {
    id: "brand_vapour",
    name: "Vapour Urban Apparel",
    shopName: "Vapour Flagship Hauz Khas",
    contactPerson: "Rohan Kapoor",
    phone: "+91 98110 54321",
    whatsapp: "+91 98110 54321",
    email: "rohan@vapoururban.com",
    location: "Hauz Khas, New Delhi",
    websiteOrCatalogUrl: "https://vapoururban.com",
    leadTimeDays: 2,
    minimumOrderQty: 15,
    marginSplitPercent: 58,
    notes: "Lightweight 200GSM honeycomb jersey knit and summer streetwear silhouette drops.",
    logoUrl: "https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&q=80&w=200",
  },
];

export const COLOR_IMAGE_MAP: Record<string, string> = {
  black: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
  pitch: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
  dark: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
  cream: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop",
  white: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop",
  chalk: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop",
  oatmeal: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop",
  grey: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  gray: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  mineral: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  charcoal: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  acid: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
  green: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
  sage: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
  olive: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
  blue: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop",
  navy: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop",
  slate: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop",
  dusty: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop",
  rust: "https://images.unsplash.com/photo-1527719327859-c6ce80353573?q=80&w=800&auto=format&fit=crop",
  terracotta: "https://images.unsplash.com/photo-1527719327859-c6ce80353573?q=80&w=800&auto=format&fit=crop",
};

export function getProductColorImage(product: Product, colorNameOrHex?: string): string {
  if (!product) return "";
  if (!colorNameOrHex) return product.images?.[0] || "";
  
  // 1. Direct match on product.colors image/imageUrl
  const matchedColor = product.colors?.find(
    (c) => c.name.toLowerCase() === colorNameOrHex.toLowerCase() || c.hex.toLowerCase() === colorNameOrHex.toLowerCase()
  );
  if (matchedColor?.image) return matchedColor.image;
  if (matchedColor?.imageUrl) return matchedColor.imageUrl;

  // 2. Direct match on product.colorImages map
  if (product.colorImages && product.colorImages[colorNameOrHex]) {
    return product.colorImages[colorNameOrHex];
  }

  // 3. Keyword heuristic on color name
  const nameLower = (matchedColor?.name || colorNameOrHex).toLowerCase();
  for (const [key, img] of Object.entries(COLOR_IMAGE_MAP)) {
    if (nameLower.includes(key)) {
      return img;
    }
  }

  return product.images?.[0] || "";
}

export function getProductBackImage(product: Product, colorNameOrHex?: string): string {
  if (!product) return "";
  if (colorNameOrHex) {
    const matchedColor = product.colors?.find(
      (c) => c.name.toLowerCase() === colorNameOrHex.toLowerCase() || c.hex.toLowerCase() === colorNameOrHex.toLowerCase()
    );
    if (matchedColor?.backImage) return matchedColor.backImage;
  }
  if (product.backImage) return product.backImage;
  const front = product.images?.[0];
  const second = product.images?.[1];
  if (second && second !== front) {
    const isAnotherColorFront = product.colors?.some(
      (c) => (c.image === second || c.imageUrl === second) && c.backImage !== second
    );
    if (!isAnotherColorFront) return second;
  }
  return "";
}

export type ProductCollection = "men" | "women";

export const MEN_CATEGORIES = [
  "Oversized Tshirts (Men)",
  "Drop Shoulder (Men)",
  "Polo Tshirts (Men)",
  "Shirts (Men)",
  "Acid Wash (Men)",
  "Jersey (Men)",
  "Oversized Printed (Men)",
  "Oversized Plain (Men)",
];

export const WOMEN_CATEGORIES = [
  "Sarees (Women)",
  "Chididhar Top (Women)",
  "Oversized Tshirts (Women)",
  "Drop Shoulder (Women)",
  "Polo Tshirts (Women)",
];

export function inferProductCollection(product: Pick<Product, "collection" | "category" | "name">): ProductCollection {
  if (product.collection === "women" || product.collection === "men") {
    return product.collection;
  }
  const hay = `${product.category || ""} ${product.name || ""}`.toLowerCase();
  if (
    /\bwomen'?s?\b|\bsaree\b|\bsarees\b|\bchididhar\b|\bchudidhar\b|\bkurti\b|\bkurta\b/.test(hay) &&
    !/men\s*&\s*women/.test(hay)
  ) {
    return "women";
  }
  return "men";
}

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: "prod_sample_oversized_men_women",
    name: "Men's Core 260GSM Boxy Oversized T-Shirt",
    description: "Men's 260GSM combed cotton oversized t-shirt featuring a bold architectural geometric back print. Structured crew ribbing and clean washed charcoal pigment finish.",
    basePrice: 640,
    price: 1490,
    collection: "men",
    category: "Oversized Tshirts (Men)",
    images: [
      "/assets/images/sample_oversized_tee_1794638342281.jpg",
      "/assets/images/sample_oversized_back_1794643591280.jpg"
    ],
    backImage: "/assets/images/sample_oversized_back_1794643591280.jpg",
    colors: [
      {
        name: "Washed Charcoal",
        hex: "#28282A",
        image: "/assets/images/sample_oversized_tee_1794638342281.jpg",
        backImage: "/assets/images/sample_oversized_back_1794643591280.jpg"
      },
      {
        name: "Warm Oat Cream",
        hex: "#EAE1D0",
        image: "/assets/images/sample_drop_shoulder_1794638341648.jpg",
        backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
      }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 38,
    brandId: "brand_rawbasics",
    brandName: "Raw Cotton Lab",
    brandShopName: "Raw Denim & Heavy Cotton Lab",
    brandContactPerson: "Nikhil Menon",
    brandPhone: "+91 99002 34567",
    brandWhatsapp: "+91 99002 34567",
    brandLocation: "Indiranagar, Bengaluru",
    sku: "RCL-OVS-MEN-260",
    initialStock: 80,
    isFeatured: true,
  },
  {
    id: "prod_sample_drop_shoulder_unisex",
    name: "Men's Studio Drop Shoulder Tee",
    description: "Men's tee engineered with deep dropped shoulder seams, relaxed boxy drape, and an oversized botanical street-art back print. Soft enzyme-washed 250GSM jersey.",
    basePrice: 660,
    price: 1590,
    collection: "men",
    category: "Drop Shoulder (Men)",
    images: [
      "/assets/images/sample_drop_shoulder_1794638341648.jpg",
      "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
    ],
    backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
    colors: [
      {
        name: "Oat Cream",
        hex: "#EAE1D0",
        image: "/assets/images/sample_drop_shoulder_1794638341648.jpg",
        backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
      },
      {
        name: "Pitch Charcoal",
        hex: "#28282A",
        image: "/assets/images/sample_oversized_tee_1794638342281.jpg",
        backImage: "/assets/images/sample_oversized_back_1794643591280.jpg"
      }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 32,
    brandId: "brand_kult",
    brandName: "Kult Streetwear Co.",
    brandShopName: "Kult Flagship Bandra",
    brandContactPerson: "Arjun Singhania",
    brandPhone: "+91 98201 12345",
    brandWhatsapp: "+91 98201 12345",
    brandLocation: "Bandra West, Mumbai",
    sku: "KLT-DROP-MEN-250",
    initialStock: 75,
    isFeatured: true,
  },
  {
    id: "prod_sample_polo_unisex",
    name: "Men's Textured Knit Collar Polo T-Shirt",
    description: "Men's breathable ribbed knit pique polo t-shirt with contrast cream tipped collar, open heritage placket, and an embroidered crest back emblem.",
    basePrice: 720,
    price: 1690,
    collection: "men",
    category: "Polo Tshirts (Men)",
    images: [
      "/assets/images/sample_polo_tshirt_1794638342678.jpg",
      "/assets/images/sample_polo_back_1794643591091.jpg"
    ],
    backImage: "/assets/images/sample_polo_back_1794643591091.jpg",
    colors: [
      {
        name: "Forest Pine",
        hex: "#1F4E3D",
        image: "/assets/images/sample_polo_tshirt_1794638342678.jpg",
        backImage: "/assets/images/sample_polo_back_1794643591091.jpg"
      }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 28,
    brandId: "brand_vapour",
    brandName: "Vapour Urban Apparel",
    brandShopName: "Vapour Flagship Hauz Khas",
    brandContactPerson: "Rohan Kapoor",
    brandPhone: "+91 98110 54321",
    brandWhatsapp: "+91 98110 54321",
    brandLocation: "Hauz Khas, New Delhi",
    sku: "VPR-POLO-MEN-230",
    initialStock: 60,
    isFeatured: true,
  },
  {
    id: "prod_sample_mens_linen_shirt",
    name: "Men's Slate Indigo Cotton-Linen Shirt",
    description: "Crisp button-down casual shirt woven from a breathable cotton-linen slub blend for men. Structured collar, chest pocket, and versatile rolled cuff styling.",
    basePrice: 820,
    price: 1890,
    collection: "men",
    category: "Shirts (Men)",
    images: [
      "/assets/images/sample_mens_shirt_1794638343165.jpg",
      "/assets/images/sample_mens_white_shirt_1794638361265.jpg"
    ],
    colors: [
      { name: "Slate Indigo", hex: "#546A7B", image: "/assets/images/sample_mens_shirt_1794638343165.jpg" },
      { name: "Crisp White", hex: "#F6F6F4", image: "/assets/images/sample_mens_white_shirt_1794638361265.jpg" }
    ],
    sizes: ["M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 26,
    brandId: "brand_rawbasics",
    brandName: "Raw Cotton Lab",
    brandShopName: "Raw Denim & Heavy Cotton Lab",
    brandContactPerson: "Nikhil Menon",
    brandPhone: "+91 99002 34567",
    brandWhatsapp: "+91 99002 34567",
    brandLocation: "Indiranagar, Bengaluru",
    sku: "RCL-SHRT-SLATE",
    initialStock: 50,
    isFeatured: true,
  },
  {
    id: "prod_sample_mens_oxford_shirt",
    name: "Men's Brushed White Oxford Shirt",
    description: "Sharp button-down oxford cotton shirt crafted for effortless men's smart-casual styling. Heavyweight brushed weave with pearl buttons and curved hem.",
    basePrice: 790,
    price: 1790,
    collection: "men",
    category: "Shirts (Men)",
    images: [
      "/assets/images/sample_mens_white_shirt_1794638361265.jpg",
      "/assets/images/sample_mens_shirt_1794638343165.jpg"
    ],
    colors: [
      { name: "Crisp White", hex: "#F6F6F4", image: "/assets/images/sample_mens_white_shirt_1794638361265.jpg" },
      { name: "Slate Indigo", hex: "#546A7B", image: "/assets/images/sample_mens_shirt_1794638343165.jpg" }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 30,
    brandId: "brand_rawbasics",
    brandName: "Raw Cotton Lab",
    brandShopName: "Raw Denim & Heavy Cotton Lab",
    brandContactPerson: "Nikhil Menon",
    brandPhone: "+91 99002 34567",
    brandWhatsapp: "+91 99002 34567",
    brandLocation: "Indiranagar, Bengaluru",
    sku: "RCL-SHRT-OXF",
    initialStock: 55,
  },
  {
    id: "prod_sample_saree_emerald",
    name: "Emerald Gold Zari Kanchipuram Saree",
    description: "Lustrous emerald-teal silk-blend saree woven with intricate antique gold zari floral motifs and a rich traditional pallu border. Includes unstitched matching blouse piece.",
    basePrice: 1450,
    price: 3290,
    collection: "women",
    category: "Sarees (Women)",
    images: [
      "/assets/images/sample_womens_saree_1794638343806.jpg",
      "/assets/images/sample_crimson_saree_1794638361418.jpg"
    ],
    colors: [
      { name: "Emerald Teal", hex: "#0E6655", image: "/assets/images/sample_womens_saree_1794638343806.jpg" },
      { name: "Royal Crimson", hex: "#7B1E2B", image: "/assets/images/sample_crimson_saree_1794638361418.jpg" }
    ],
    sizes: ["Free Size"],
    isAvailable: true,
    stockCount: 18,
    brandId: "brand_kult",
    brandName: "Kult Streetwear Co.",
    brandShopName: "Kult Heritage Looms",
    brandContactPerson: "Arjun Singhania",
    brandPhone: "+91 98201 12345",
    brandWhatsapp: "+91 98201 12345",
    brandLocation: "Bandra West, Mumbai",
    sku: "KLT-SAREE-EMR",
    initialStock: 30,
    isFeatured: true,
  },
  {
    id: "prod_sample_saree_crimson",
    name: "Crimson Heritage Banarasi Zari Saree",
    description: "Festive royal crimson woven silk saree featuring fine gold zari butti motifs and an heirloom temple-inspired pallu border. Drapes effortlessly in crisp pleats.",
    basePrice: 1550,
    price: 3490,
    collection: "women",
    category: "Sarees (Women)",
    images: [
      "/assets/images/sample_crimson_saree_1794638361418.jpg",
      "/assets/images/sample_womens_saree_1794638343806.jpg"
    ],
    colors: [
      { name: "Royal Crimson", hex: "#7B1E2B", image: "/assets/images/sample_crimson_saree_1794638361418.jpg" },
      { name: "Emerald Teal", hex: "#0E6655", image: "/assets/images/sample_womens_saree_1794638343806.jpg" }
    ],
    sizes: ["Free Size"],
    isAvailable: true,
    stockCount: 15,
    brandId: "brand_kult",
    brandName: "Kult Streetwear Co.",
    brandShopName: "Kult Heritage Looms",
    brandContactPerson: "Arjun Singhania",
    brandPhone: "+91 98201 12345",
    brandWhatsapp: "+91 98201 12345",
    brandLocation: "Bandra West, Mumbai",
    sku: "KLT-SAREE-CRM",
    initialStock: 25,
  },
  {
    id: "prod_sample_chididhar_rose",
    name: "Dusty Rose Zari Embroidered Chididhar Top",
    description: "Refined cotton-silk chididhar kurti top for women adorned with intricate gold zari paisley yoke embroidery and 3/4 embroidered cuffs. Pairs seamlessly with churidar trousers and dupatta.",
    basePrice: 890,
    price: 1990,
    collection: "women",
    category: "Chididhar Top (Women)",
    images: [
      "/assets/images/sample_chididhar_top_1794638343542.jpg",
      "/assets/images/sample_ivory_chididhar_1794638362189.jpg"
    ],
    colors: [
      { name: "Dusty Rose", hex: "#B87478", image: "/assets/images/sample_chididhar_top_1794638343542.jpg" },
      { name: "Pastel Sage", hex: "#B5C7B3", image: "/assets/images/sample_ivory_chididhar_1794638362189.jpg" }
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 24,
    brandId: "brand_acidcraft",
    brandName: "Acid Craft Studios",
    brandShopName: "Acid Craft Ethnic Studio",
    brandContactPerson: "Kavita Rao",
    brandPhone: "+91 98450 67890",
    brandWhatsapp: "+91 98450 67890",
    brandLocation: "Tirupur, Tamil Nadu",
    sku: "ACS-CHID-ROSE",
    initialStock: 40,
    isFeatured: true,
  },
  {
    id: "prod_sample_chididhar_sage",
    name: "Pastel Sage Chikankari Chididhar Top",
    description: "Breathable handloom-feel sage cotton chididhar top featuring delicate ivory chikankari floral threadwork across the mandarin placket and sleeves.",
    basePrice: 840,
    price: 1850,
    collection: "women",
    category: "Chididhar Top (Women)",
    images: [
      "/assets/images/sample_ivory_chididhar_1794638362189.jpg",
      "/assets/images/sample_chididhar_top_1794638343542.jpg"
    ],
    colors: [
      { name: "Pastel Sage", hex: "#B5C7B3", image: "/assets/images/sample_ivory_chididhar_1794638362189.jpg" },
      { name: "Dusty Rose", hex: "#B87478", image: "/assets/images/sample_chididhar_top_1794638343542.jpg" }
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 29,
    brandId: "brand_acidcraft",
    brandName: "Acid Craft Studios",
    brandShopName: "Acid Craft Ethnic Studio",
    brandContactPerson: "Kavita Rao",
    brandPhone: "+91 98450 67890",
    brandWhatsapp: "+91 98450 67890",
    brandLocation: "Tirupur, Tamil Nadu",
    sku: "ACS-CHID-SAGE",
    initialStock: 45,
  },
  {
    id: "prod_sample_womens_oversized_tee",
    name: "Women's Botanical Studio Oversized Tee",
    description: "Women's relaxed 250GSM combed cotton oversized t-shirt tailored with a soft drape shoulder line and botanical graphic back print.",
    basePrice: 630,
    price: 1490,
    collection: "women",
    category: "Oversized Tshirts (Women)",
    images: [
      "/assets/images/sample_drop_shoulder_1794638341648.jpg",
      "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
    ],
    backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
    colors: [
      {
        name: "Warm Oat Cream",
        hex: "#EAE1D0",
        image: "/assets/images/sample_drop_shoulder_1794638341648.jpg",
        backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
      },
      {
        name: "Sage Leaf",
        hex: "#7E8F7C",
        image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
        backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg"
      }
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 34,
    brandId: "brand_vapour",
    brandName: "Vapour Urban Apparel",
    brandShopName: "Vapour Women's Studio",
    brandContactPerson: "Rohan Kapoor",
    brandPhone: "+91 98110 54321",
    brandWhatsapp: "+91 98110 54321",
    brandLocation: "Hauz Khas, New Delhi",
    sku: "VPR-WMN-OVS-250",
    initialStock: 60,
    isFeatured: true,
  },
  {
    id: "prod_sample_womens_polo",
    name: "Women's Classic Knit Tipped Polo Tee",
    description: "Women's tailored pique cotton knit polo t-shirt with structured cream-tipped collar and embroidered heritage emblem on back.",
    basePrice: 690,
    price: 1590,
    collection: "women",
    category: "Polo Tshirts (Women)",
    images: [
      "/assets/images/sample_polo_tshirt_1794638342678.jpg",
      "/assets/images/sample_polo_back_1794643591091.jpg"
    ],
    backImage: "/assets/images/sample_polo_back_1794643591091.jpg",
    colors: [
      {
        name: "Forest Pine",
        hex: "#1F4E3D",
        image: "/assets/images/sample_polo_tshirt_1794638342678.jpg",
        backImage: "/assets/images/sample_polo_back_1794643591091.jpg"
      },
      {
        name: "Chalk White",
        hex: "#FAFAFA",
        image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop",
        backImage: "/assets/images/sample_polo_back_1794643591091.jpg"
      }
    ],
    sizes: ["XS", "S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 26,
    brandId: "brand_vapour",
    brandName: "Vapour Urban Apparel",
    brandShopName: "Vapour Women's Studio",
    brandContactPerson: "Rohan Kapoor",
    brandPhone: "+91 98110 54321",
    brandWhatsapp: "+91 98110 54321",
    brandLocation: "Hauz Khas, New Delhi",
    sku: "VPR-WMN-POLO",
    initialStock: 50,
  },
  {
    id: "prod_oversized_blank",
    name: "Men's The Ultimate Oversized Tee",
    description: "Crafted from 240GSM ultra-heavyweight combed cotton for men. Features a boxy streetwear fit, drop shoulders, and a thick ribbed neckband.",
    basePrice: 650, // Cost price from brand partner
    price: 1490,    // Retail selling price
    collection: "men",
    category: "Oversized Plain (Men)",
    images: [
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_oversized_back_1794643591280.jpg",
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_oversized_back_1794643591280.jpg",
    colors: [
      { name: "Pitch Black", hex: "#121212", image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" },
      { name: "Warm Cream", hex: "#EADCC9", image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" },
      { name: "Sage Green", hex: "#7E8F7C", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_polo_back_1794643591091.jpg" },
      { name: "Slate Blue", hex: "#5C6B73", image: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 45,
    brandId: "brand_rawbasics",
    brandName: "Raw Cotton Lab",
    brandShopName: "Raw Denim & Heavy Cotton Lab",
    brandContactPerson: "Nikhil Menon",
    brandPhone: "+91 99002 34567",
    brandWhatsapp: "+91 99002 34567",
    brandLocation: "Indiranagar, Bengaluru",
    sku: "RCL-BLANK-240",
    initialStock: 100,
    isFeatured: true,
  },
  {
    id: "prod_heavyweight_basic",
    name: "Classic Acid Wash Heavyweight Tee",
    description: "Built with a rugged 280GSM structured acid-washed cotton weave. Offers a classic tailored fit that holds its shape beautifully throughout the day. Finished with double-needle stitched hems for maximum durability.",
    basePrice: 750,
    price: 1790,
    collection: "men",
    category: "Acid Wash (Men)",
    images: [
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_oversized_back_1794643591280.jpg",
      "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1527719327859-c6ce80353573?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_oversized_back_1794643591280.jpg",
    colors: [
      { name: "Mineral Grey", hex: "#3A3E41", image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" },
      { name: "Pure White", hex: "#FFFFFF", image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" },
      { name: "Rich Navy", hex: "#1D2A44", image: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" },
      { name: "Terracotta Rust", hex: "#A34A38", image: "https://images.unsplash.com/photo-1527719327859-c6ce80353573?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" }
    ],
    sizes: ["M", "L", "XL"],
    isAvailable: true,
    stockCount: 14,
    brandId: "brand_acidcraft",
    brandName: "Acid Craft Studios",
    brandShopName: "Acid Craft Tirupur Hub",
    brandContactPerson: "Kavita Rao",
    brandPhone: "+91 98450 67890",
    brandWhatsapp: "+91 98450 67890",
    brandLocation: "Tirupur, Tamil Nadu",
    sku: "ACS-ACID-280",
    initialStock: 80,
    isFeatured: true,
  },
  {
    id: "prod_minimalist_graphic",
    name: "Abstract Architect Oversized Printed Tee",
    description: "A streetwear staple featuring a clean typography mark on the chest and an architectural blueprint illustration screen-printed across the back using non-toxic water-based ink. 240GSM boxy fit.",
    basePrice: 850,
    price: 1990,
    collection: "men",
    category: "Oversized Printed (Men)",
    images: [
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_oversized_back_1794643591280.jpg",
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_oversized_back_1794643591280.jpg",
    colors: [
      { name: "Pitch Black", hex: "#121212", image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" },
      { name: "Warm Cream", hex: "#EADCC9", image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" }
    ],
    sizes: ["S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 35,
    brandId: "brand_kult",
    brandName: "Kult Streetwear Co.",
    brandShopName: "Kult Flagship Bandra",
    brandContactPerson: "Arjun Singhania",
    brandPhone: "+91 98201 12345",
    brandWhatsapp: "+91 98201 12345",
    brandLocation: "Bandra West, Mumbai",
    sku: "KLT-ARCH-240",
    initialStock: 90,
    isFeatured: true,
  },
  {
    id: "prod_daily_slub",
    name: "Aero Mesh Breathable Jersey Tee",
    description: "Lightweight 200GSM honeycomb jersey knit cotton blend. Highly breathable, soft-washed, and featuring a relaxed casual drape. The absolute perfect fit for warm climates and everyday streetwear.",
    basePrice: 1,
    price: 1,
    collection: "men",
    category: "Jersey (Men)",
    images: [
      "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
      "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop",
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
    colors: [
      { name: "Olive Drab", hex: "#4B5320", image: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_polo_back_1794643591091.jpg" },
      { name: "Oatmeal Melange", hex: "#D6CFC7", image: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" },
      { name: "Dusty Blue", hex: "#7E90A3", image: "https://images.unsplash.com/photo-1562157873-818bc0726f68?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" }
    ],
    sizes: ["S", "M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 50,
    brandId: "brand_vapour",
    brandName: "Vapour Urban Apparel",
    brandShopName: "Vapour Flagship Hauz Khas",
    brandContactPerson: "Rohan Kapoor",
    brandPhone: "+91 98110 54321",
    brandWhatsapp: "+91 98110 54321",
    brandLocation: "Hauz Khas, New Delhi",
    sku: "VPR-JERSEY-200",
    initialStock: 120,
    isFeatured: true,
  },
  {
    id: "prod_vintage_acid",
    name: "Vintage Distressed Mineral Acid Wash Tee",
    description: "Custom hand-dyed acid wash 260GSM combed cotton. Each shirt exhibits a unique vintage fade finish with distressed ribbed collar.",
    basePrice: 720,
    price: 1690,
    collection: "men",
    category: "Acid Wash (Men)",
    images: [
      "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_oversized_back_1794643591280.jpg",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_oversized_back_1794643591280.jpg",
    colors: [
      { name: "Acid Black", hex: "#2B2B2B", image: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" },
      { name: "Washed Charcoal", hex: "#4A4A4A", image: "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" }
    ],
    sizes: ["M", "L", "XL", "XXL"],
    isAvailable: true,
    stockCount: 8,
    brandId: "brand_acidcraft",
    brandName: "Acid Craft Studios",
    brandShopName: "Acid Craft Tirupur Hub",
    brandContactPerson: "Kavita Rao",
    brandPhone: "+91 98450 67890",
    brandWhatsapp: "+91 98450 67890",
    brandLocation: "Tirupur, Tamil Nadu",
    sku: "ACS-VINT-260",
    initialStock: 60,
  },
  {
    id: "prod_plain_heavy",
    name: "Essential Heavyweight Oversized Plain Tee",
    description: "Ultra-clean minimalist 250GSM boxy plain tee with drop shoulders and reinforced crew neckline. Unbranded blank silhouette.",
    basePrice: 620,
    price: 1390,
    collection: "men",
    category: "Oversized Plain (Men)",
    images: [
      "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop",
      "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
      "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop"
    ],
    backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg",
    colors: [
      { name: "Chalk White", hex: "#FAFAFA", image: "https://images.unsplash.com/photo-1581655353564-df123a1eb820?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_drop_shoulder_back_1794643590814.jpg" },
      { name: "Deep Navy", hex: "#0B192C", image: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?q=80&w=800&auto=format&fit=crop", backImage: "/assets/images/sample_oversized_back_1794643591280.jpg" }
    ],
    sizes: ["S", "M", "L", "XL"],
    isAvailable: true,
    stockCount: 40,
    brandId: "brand_rawbasics",
    brandName: "Raw Cotton Lab",
    brandShopName: "Raw Denim & Heavy Cotton Lab",
    brandContactPerson: "Nikhil Menon",
    brandPhone: "+91 99002 34567",
    brandWhatsapp: "+91 99002 34567",
    brandLocation: "Indiranagar, Bengaluru",
    sku: "RCL-ESSENT-250",
    initialStock: 75,
  }
];

export const CATEGORIES = [
  "All",
  ...MEN_CATEGORIES,
  ...WOMEN_CATEGORIES,
];

export const DEFAULT_CALCULATOR: ResellerCalculator = {
  batchSize: 150,
  unitWholesaleCost: 550,
  shippingCostTotal: 12000,
  customsDutyTotal: 8000,
  packagingCostPerUnit: 40,
  marketingCostTotal: 5000,
  targetRetailPrice: 1590
};

export const DEFAULT_ORDERS: Order[] = [
  {
    id: "ORD-995201",
    userId: "usr_101",
    customerName: "Alex Morgan",
    customerPhone: "+91 98765 43210",
    customerAddress: "42 Park View Apartments, Sector 15, New Delhi - 110001",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_oversized_blank",
        productName: "The Ultimate Oversized Tee",
        size: "XL",
        color: "Pitch Black",
        quantity: 2,
        price: 1490,
        brandId: "brand_rawbasics",
        brandName: "Raw Cotton Lab",
      },
      {
        productId: "prod_minimalist_graphic",
        productName: "Abstract Architect Graphic Tee",
        size: "L",
        color: "Pitch Black",
        quantity: 1,
        price: 1990,
        brandId: "brand_kult",
        brandName: "Kult Streetwear Co.",
      }
    ],
    totalAmount: 4970,
    status: "shipped",
    createdAt: "24 Jul 2026, 09:15 am",
    paymentMethod: "Credit Card",
    paymentStatus: "paid",
    transactionId: "TXN-CARD-991823",
    trackingNumber: "DEL-8891204X",
    carrier: "Delhivery Express",
    estimatedDelivery: "Tomorrow, 5:00 PM"
  },
  {
    id: "ORD-881230",
    userId: "usr_101",
    customerName: "Alex Morgan",
    customerPhone: "+91 98765 43210",
    customerAddress: "42 Park View Apartments, Sector 15, New Delhi - 110001",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_heavyweight_basic",
        productName: "Classic Heavyweight Tee",
        size: "L",
        color: "Rich Navy",
        quantity: 2,
        price: 1790,
        brandId: "brand_acidcraft",
        brandName: "Acid Craft Studios",
      }
    ],
    totalAmount: 3580,
    status: "processing",
    createdAt: "25 Jul 2026, 02:40 pm",
    paymentMethod: "UPI Instant",
    paymentStatus: "paid",
    transactionId: "TXN-UPI-771239",
    trackingNumber: "BLU-771209Y",
    carrier: "BlueDart Priority",
    estimatedDelivery: "27 Jul 2026"
  },
  {
    id: "ORD-452109",
    userId: "usr_101",
    customerName: "Alex Morgan",
    customerPhone: "+91 98765 43210",
    customerAddress: "42 Park View Apartments, Sector 15, New Delhi - 110001",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_daily_slub",
        productName: "Aero Slub Summer Tee",
        size: "M",
        color: "Oatmeal Melange",
        quantity: 1,
        price: 1190,
        brandId: "brand_vapour",
        brandName: "Vapour Urban Apparel",
      }
    ],
    totalAmount: 1190,
    status: "completed",
    createdAt: "18 Jul 2026, 11:30 am",
    paymentMethod: "NetBanking",
    paymentStatus: "paid",
    transactionId: "TXN-NET-551029",
    trackingNumber: "DEL-102938Z",
    carrier: "Delhivery Express",
    estimatedDelivery: "20 Jul 2026 (Delivered)"
  },
  {
    id: "ORD-210934",
    customerName: "Kabir Singh",
    customerPhone: "+91 94440 98765",
    customerAddress: "",
    deliveryMethod: "pickup",
    items: [
      {
        productId: "prod_daily_slub",
        productName: "Aero Slub Summer Tee",
        size: "M",
        color: "Oatmeal Melange",
        quantity: 5,
        price: 1190,
        brandId: "brand_vapour",
        brandName: "Vapour Urban Apparel",
      }
    ],
    totalAmount: 5950,
    status: "completed",
    createdAt: "5 Jul 2026, 09:10 am"
  },
  {
    id: "ORD-301298",
    customerName: "Priya Sharma",
    customerPhone: "+91 98112 34567",
    customerAddress: "E-302, Green Glen Layout, Bellandur, Bangalore",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_oversized_blank",
        productName: "The Ultimate Oversized Tee",
        size: "M",
        color: "Sage Green",
        quantity: 3,
        price: 1490,
        brandId: "brand_rawbasics",
        brandName: "Raw Cotton Lab",
      }
    ],
    totalAmount: 4470,
    status: "confirmed",
    createdAt: "6 Jul 2026, 02:40 pm"
  },
  {
    id: "ORD-774412",
    customerName: "Aarav Mehta",
    customerPhone: "+91 99200 88888",
    customerAddress: "Block C, Satellite, Ahmedabad",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_heavyweight_basic",
        productName: "Classic Heavyweight Tee",
        size: "XL",
        color: "Terracotta Rust",
        quantity: 2,
        price: 1790,
        brandId: "brand_acidcraft",
        brandName: "Acid Craft Studios",
      },
      {
        productId: "prod_minimalist_graphic",
        productName: "Abstract Architect Graphic Tee",
        size: "L",
        color: "Pitch Black",
        quantity: 2,
        price: 1990,
        brandId: "brand_kult",
        brandName: "Kult Streetwear Co.",
      }
    ],
    totalAmount: 7560,
    status: "completed",
    createdAt: "7 Jul 2026, 06:15 pm"
  },
  {
    id: "ORD-908123",
    customerName: "Diya Nair",
    customerPhone: "+91 96111 22233",
    customerAddress: "",
    deliveryMethod: "pickup",
    items: [
      {
        productId: "prod_daily_slub",
        productName: "Aero Slub Summer Tee",
        size: "S",
        color: "Dusty Blue",
        quantity: 2,
        price: 1190,
        brandId: "brand_vapour",
        brandName: "Vapour Urban Apparel",
      },
      {
        productId: "prod_oversized_blank",
        productName: "The Ultimate Oversized Tee",
        size: "M",
        color: "Warm Cream",
        quantity: 1,
        price: 1490,
        brandId: "brand_rawbasics",
        brandName: "Raw Cotton Lab",
      }
    ],
    totalAmount: 3870,
    status: "pending",
    createdAt: "8 Jul 2026, 11:05 am"
  },
  {
    id: "ORD-109283",
    customerName: "Vikram Rathore",
    customerPhone: "+91 90011 22334",
    customerAddress: "S-5, Vaishali Nagar, Jaipur",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_minimalist_graphic",
        productName: "Abstract Architect Graphic Tee",
        size: "XL",
        color: "Pitch Black",
        quantity: 3,
        price: 1990,
        brandId: "brand_kult",
        brandName: "Kult Streetwear Co.",
      }
    ],
    totalAmount: 5970,
    status: "pending",
    createdAt: "9 Jul 2026, 01:05 pm"
  },
  {
    id: "ORD-554421",
    customerName: "Sameer Joshi",
    customerPhone: "+91 98220 11999",
    customerAddress: "104 Koregaon Park, Pune",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_vintage_acid",
        productName: "Vintage Distressed Mineral Acid Wash Tee",
        size: "L",
        color: "Acid Black",
        quantity: 2,
        price: 1690,
        brandId: "brand_acidcraft",
        brandName: "Acid Craft Studios",
      },
      {
        productId: "prod_plain_heavy",
        productName: "Essential Heavyweight Oversized Plain Tee",
        size: "M",
        color: "Chalk White",
        quantity: 2,
        price: 1390,
        brandId: "brand_rawbasics",
        brandName: "Raw Cotton Lab",
      }
    ],
    totalAmount: 6160,
    status: "completed",
    createdAt: "12 Jul 2026, 04:20 pm"
  },
  {
    id: "ORD-667788",
    customerName: "Rhea Sen",
    customerPhone: "+91 98300 44556",
    customerAddress: "Flat 4A, Salt Lake Sector 1, Kolkata",
    deliveryMethod: "delivery",
    items: [
      {
        productId: "prod_minimalist_graphic",
        productName: "Abstract Architect Graphic Tee",
        size: "M",
        color: "Warm Cream",
        quantity: 2,
        price: 1990,
        brandId: "brand_kult",
        brandName: "Kult Streetwear Co.",
      }
    ],
    totalAmount: 3980,
    status: "completed",
    createdAt: "15 Jul 2026, 03:10 pm"
  }
];
