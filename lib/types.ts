export type Product = {
  id: string; 
  name: string;
  category: string;
  price: string; 
  created_at: string; 
  updated_at: string;
};

export type ProductsResponse = {
  products: Product[];
  nextCursor: string | null;
  hasMore: boolean;
};

export const CATEGORIES = [
  "Electronics",
  "Books",
  "Clothing",
  "Home",
  "Toys",
] as const;
