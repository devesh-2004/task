export type Product = {
  id: string; // BIGINT as string
  name: string;
  category: string;
  price: string; // NUMERIC as string to preserve exact value
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
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
