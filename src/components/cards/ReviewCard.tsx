import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star } from 'lucide-react';
import { Review } from '@/lib/mockData/mockDataTypes';
import { getSingleUser } from '@/lib/mockData/mockApi';
import { formateDate } from '@/lib/utils';

export default function ReviewCard({ review }: { review: Review }) {
  const { user, rating, comment, createdAt } = review;

  const renderStars = (count: number) => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-5 w-5 ${i < count ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
        />
      );
    }
    return stars;
  };

  const formattedDate = formateDate(createdAt);

  const { name: userName, image: userImage } = getSingleUser(user)!;

  return (
    <Card className='w-full shadow-sm'>
      <CardHeader className='flex flex-row items-center gap-4'>
        <Avatar className='h-10 w-10'>
          <AvatarImage src={userImage} alt={userName} />
          <AvatarFallback>{userName}</AvatarFallback>
        </Avatar>
        <div className='grid gap-1'>
          <div className='font-semibold text-gray-900'>{userName}</div>
          <div className='flex items-center gap-1' aria-label={`Rating: ${rating} out of 5 stars`}>
            {renderStars(rating)}
          </div>
        </div>
      </CardHeader>
      <CardContent className='grid gap-2 pt-0'>
        <p className='text-gray-700'>{comment}</p>
        <div className='text-sm text-gray-500'>{formattedDate}</div>
      </CardContent>
    </Card>
  );
}
