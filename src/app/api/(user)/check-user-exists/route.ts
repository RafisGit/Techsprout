import { errorResponse, successResponse } from '@/lib/apiResponse';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User.model';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  await connectDB();

  try {
    const { searchParams } = new URL(req.url);

    const username = searchParams.get('username');
    const email = searchParams.get('email');

    if (username || email) {
      const exists = await User.exists({
        $or: [{ username: username }, { email: email }],
      });

      if (exists) {
        return successResponse(`${email ? 'Email' : 'Username'} already in use`, exists);
      }
    }

    return errorResponse("User doesn't exists");
  } catch (error) {
    return errorResponse(
      'There was a problem in the serve while processing the request',
      500,
      'Server_Error',
      error
    );
  }
}
