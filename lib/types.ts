export type Member = {
  id: string;
  name: string;
  current_reading: string | null;
  created_at: string;
};

export type Book = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  genre: string | null;
  progress_percent: number | null;
  suggested_by: string | null;
  meeting_date: string | null;
  meeting_location: string | null;
  library_copies: string | null;
  cocktail_name: string | null;
  cocktail_recipe: string | null;
  cocktail_paired_by: string | null;
  goodreads_url: string | null;
  libby_url: string | null;
  library_url: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

export type Vote = {
  id: string;
  nomination_id: string;
  member_id: string;
  created_at: string;
};

export type Nomination = {
  id: string;
  title: string;
  author: string;
  year: number | null;
  pages: number | null;
  genre: string | null;
  description: string | null;
  library_wait: string | null;
  has_audio: boolean;
  has_paperback: boolean;
  has_adaptation: boolean;
  suggested_by_member_id: string | null;
  suggested_by_name: string | null;
  created_at: string;
  votes?: Vote[];
};

export type Quote = {
  id: string;
  quote_text: string;
  book_title: string;
  book_author: string | null;
  submitted_by_member_id: string | null;
  submitted_by_name: string | null;
  created_at: string;
};

export type ReadingHistory = {
  id: string;
  title: string;
  author: string;
  suggested_by: string | null;
  read_date: string | null;
  rating: number | string | null;
  group_note: string | null;
  created_at: string;
};
