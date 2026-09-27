import { blogs, brands, courses, reviews, users } from './mockData';
import { Blog, Course } from './mockDataTypes';

export function getBrands() {
  return brands;
}

export function getCategories(): string[] {
  const categories: string[] = [];

  for (const course of courses) {
    if (!categories.includes(course.category)) {
      categories.push(course.category);
    }
  }

  return categories;
}

export function getCourseCount(category: string) {
  let count = 0;

  for (const course of courses) {
    if (course.category === category) {
      count++;
    }
  }

  return count;
}

export function getUserName(id: string) {
  const user = users.find((user) => user._id === id);

  return user?.name;
}

export function getSingleUser(id: string) {
  return users.find((user) => user._id === id);
}

export function getTopInstructor() {
  return users.filter((user) => user.role === 'top-instructor')!;
}

export function getCourseReviews(id: string) {
  return reviews.filter((review) => review.course === id);
}

export function getFeaturedCourses(): Course[] {
  return courses.filter((course) => course.featured);
}

export function getSingleCourse(id: string): Course {
  return courses.find((course) => course._id === id)!;
}

export function getSingleBlog(id: string): Blog {
  return blogs.find((blog) => blog._id === id)!;
}
