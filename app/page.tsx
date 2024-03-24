import {
  FrameButton,
  FrameContainer,
  FrameImage,
  FrameInput,
  FrameReducer,
  NextServerPageProps,
  getFrameMessage,
  getPreviousFrame,
  useFramesReducer,
} from "frames.js/next/server";
import Link from "next/link";
import {kv} from "@vercel/kv";
import { DEFAULT_DEBUGGER_HUB_URL, createDebugUrl } from "./debug";
import { currentURL } from "./utils";

type State = {
	id: string,
	happy: number,
	unhappy: number,
	neutral: number
};

const HAPPY = 1;
const NEUTRAL= 2;
const UNHAPPY = 3;


// const initialState = { active: "1", total_button_presses: 0 };
// const initialState = { id: "here"};

const reducer: FrameReducer<State> = async (state, action) => {
	console.log(action)
	console.log(state)
	// console.log(action?.postBody?.untrustedData?.castId)
	const pressedBtn = action.postBody?.untrustedData.buttonIndex;
	const voteWeight = 1;
	let happy = Number(state.happy)
	let neutral = Number(state.neutral)
	let unhappy = Number(state.unhappy)
	if (pressedBtn === HAPPY) {
		happy = happy  + 1
	} else if (pressedBtn === NEUTRAL) {
		neutral = neutral  + 1
	} else if (pressedBtn === UNHAPPY) {
		unhappy = unhappy + 1
	}

	console.log({id: state.id, happy, neutral, unhappy})
	console.log(pressedBtn)
	await kv.hset(`poll:${state.id}`, {id: state.id, happy, neutral, unhappy});
  return {
		id: state.id,
    happy:  happy,
    neutral:  neutral,
    unhappy:  unhappy,
  };
};

// 1. Get or create poll
// 2. Create vote
// 3. Add vote to value
// 4. decrement from value when vote is changed
const getOrCreatePoll = async (id: string) => {
	// id will be snapshot proposal id
	const exists = await kv.hget(`poll:${id}`, "id");
	console.log("Exitsts")
	if (!exists) {
		const defaultValues = {id: id, happy: 0, unhappy: 0, neutral: 0}
	  await kv.hset(`poll:${id}`, defaultValues);
		return defaultValues
	}
	// can be optimized
	const happy = await kv.hget(`poll:${id}`, "happy") as number;
	const unhappy = await kv.hget(`poll:${id}`, "unhappy") as number;
	const neutral = await kv.hget(`poll:${id}`, "neutral") as number;
	return {id, happy: Number(happy), unhappy: Number(unhappy), neutral: Number(neutral)}
  
}

// This is a react server component only
export default async function Home({ searchParams }: NextServerPageProps) {
	const defaultProposalId = '0x1204041955b729052b9adb4da9e3fa9a03c415ca45aeefd5c41da4d9d45ea85';
  const url = currentURL("/");
  const previousFrame = getPreviousFrame<State>(searchParams);
	// console.log(previousFrame)

  const frameMessage = await getFrameMessage(previousFrame.postBody, {
    hubHttpUrl: DEFAULT_DEBUGGER_HUB_URL,
  });

  if (frameMessage && !frameMessage?.isValid) {
    throw new Error("Invalid frame payload");
  }
	const initialState = await getOrCreatePoll(defaultProposalId)
	console.log("initialState")
	console.log(initialState)

	// get/create poll

  const [state, dispatch] = useFramesReducer<State>(
    reducer,
    initialState,
    previousFrame
  );
	const awaitedState = await state

	// create poll if doesn't exist
	// https://docs.farcaster.xyz/reference/hubble/httpapi/verification

  // Here: do a server side side effect either sync or async (using await), such as minting an NFT if you want.
  // example: load the users credentials & check they have an NFT

  // console.log("info: state is:", state);

	// 3 buttons	Happy neutral unhappy
	// Store in vercel kv
	// Allow for setting that cn token gate from
	// User posts url with the frame
	//	- So on cast the poll should be created on cast
	//
	//
  // then, when done, return next frame
  return (
    <div className="p-4">
      frames.js starter kit. The Template Frame is on this page, it&apos;s in
      the html meta tags (inspect source).{" "}
      <Link href={createDebugUrl(url)} className="underline">
        Debug
      </Link>{" "}
      or see{" "}
      <Link href="/examples" className="underline">
        other examples
      </Link>
      <FrameContainer
        postUrl="/frames"
        pathname="/"
        state={awaitedState}
        previousFrame={previousFrame}
      >
        {/* <FrameImage src="https://framesjs.org/og.png" /> */}
        <FrameImage aspectRatio="1.91:1">
          <div tw="w-full h-full bg-slate-700 text-white justify-center items-center flex flex-col">
            <div tw="flex flex-row">
              {frameMessage?.inputText ? frameMessage.inputText : "Hello world"}
            </div>
            {frameMessage && (
              <div tw="flex flex-col">
                <div tw="flex">
                  Requester is @{frameMessage.requesterUserData?.username}{" "}
                </div>
                <div tw="flex">
                  Requester follows caster:{" "}
                  {frameMessage.requesterFollowsCaster ? "true" : "false"}
                </div>
                <div tw="flex">
                  Caster follows requester:{" "}
                  {frameMessage.casterFollowsRequester ? "true" : "false"}
                </div>
                <div tw="flex">
                  Requester liked cast:{" "}
                  {frameMessage.likedCast ? "true" : "false"}
                </div>
                <div tw="flex">
                  Requester recasted cast:{" "}
                  {frameMessage.recastedCast ? "true" : "false"}
                </div>
              </div>
            )}
          </div>
        </FrameImage>
        <FrameButton>
          Happy
        </FrameButton>
        <FrameButton>
          Neutral
        </FrameButton>
        <FrameButton>
          Unhappy
        </FrameButton>
      </FrameContainer>
    </div>
  );
}
