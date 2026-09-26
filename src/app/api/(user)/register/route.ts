import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User.model';

export async function POST(req: NextRequest) {
  await connectDB();

  try {
    const bodyData = await req.json();

    const newUser = await User.create({
      ...bodyData,
    });

    return NextResponse.json(newUser);
  } catch (error) {
    console.log(error);
  }
}
