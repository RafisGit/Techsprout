import { StaticImageData } from "next/image";

export interface Testimonial{
  image: StaticImageData
  name: string,
  occupation:string,
  message:string,
}

export interface User {
  _id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  occupation: string;
  bio: string;
  socialLinks: string[];
  image: string;
  role: 'user' | 'admin' | 'instructor' | 'top-instructor';
  registeredAt: string;
  wishlist: string[];
}

export interface Course {
  _id: string;
  title: string;
  category: string;
  price: number;
  isFree: boolean;
  thumbnail: string;
  demoVideo: string;
  lessons: string[];
  featured: boolean;
  instructor: string; // user ID
  duration: string;
  reviews: string[]; // review IDs
  enrolments: string[]; // enrolment IDs
  description: string;
  audience: string[];
  requirements: string[];
  resources: string[];
  keyLearningPoints: string[];
}

export interface Enrolment {
  _id: string;
  user: string;
  course: string;
  status: 'active' | 'completed';
  enrolledAt: string;
}

export interface Review {
  _id: string;
  user: string;
  course: string;
  rating: number;
  comment: string;
  featured: boolean;
  createdAt: string;
}

export interface Blog {
  _id: string;
  title: string;
  content: string;
  image: string;
  tags: string[];
  author: string;
  createdAt: string;
  quote: string;
  keyPoints: string[];
  category: string;
  comments: {
    user: string;
    comment: string;
    createdAt: string;
  }[];
}

export interface Cart {
  _id: string;
  user: string;
  items: {
    course: string;
    price: number;
  }[];
  totalAmount: number;
}

export interface Order {
  _id: string;
  user: string;
  courses: string[];
  totalAmount: number;
  orderedAt: string;
}

export interface Question {
  _id: string;
  user: string;
  course: string;
  question: string;
  answer: string;
  status: 'read' | 'unread' | 'important' | 'archived';
  createdAt: string;
}

export interface Instructor {
  _id: string;
  user: string;
  expertise: string[];
  isTop: boolean;
}

export interface Subscriber {
  _id: string;
  email: string;
  subscribedAt: string;
}

export interface FAQ {
  question: string;
  answer: string;
}
