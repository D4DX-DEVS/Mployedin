export interface Banner {
  _id: string;
  title: string;
  titleAr: string;
  subtitle: string;
  subtitleAr: string;
  image: string;
  linkUrl: string;
  linkText: string;
  linkTextAr: string;
}

export interface FAQ {
  _id: string;
  question: string;
  questionAr: string;
  answer: string;
  answerAr: string;
  category: string;
}

export interface Testimonial {
  _id: string;
  name: string;
  nameAr: string;
  designation: string;
  designationAr: string;
  company: string;
  companyAr: string;
  quote: string;
  quoteAr: string;
  avatar: string;
  rating: number;
}

export interface Video {
  _id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  url: string;
}

export interface BlogPost {
  _id: string;
  title: string;
  titleAr: string;
  slug: string;
  excerpt: string;
  excerptAr: string;
  coverImage: string;
  author: string;
  publishedAt: string;
}

export interface LandingStats {
  activeJobs: number;
  verifiedEmployers: number;
  countries: number;
  placementsThisMonth: number;
  remoteJobs: number;
  topCountries: { name: string; nameAr: string; count: number }[];
}

export interface LandingData {
  banners: Banner[];
  faqs: FAQ[];
  testimonials: Testimonial[];
  videos: Video[];
  recentPosts: BlogPost[];
  stats?: LandingStats | null;
}

export type Audience = "jobSeeker" | "employer";

/** Props every landing section takes. */
export interface SectionProps {
  locale: string;
}
