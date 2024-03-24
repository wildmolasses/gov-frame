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
import { DEFAULT_DEBUGGER_HUB_URL, createDebugUrl } from "./debug";
import { currentURL } from "./utils";
import { gql, ApolloQueryResult } from "@apollo/client";
import createApolloClient from "./apollo-client";
import { Proposal, Vp, User } from "./gql/graphql";

type State = {
  active: string;
  total_button_presses: number;
};

function nFormatter(num, digits) {
  const lookup = [
    { value: 1, symbol: "" },
    { value: 1e3, symbol: "k" },
    { value: 1e6, symbol: "M" },
    { value: 1e9, symbol: "G" },
    { value: 1e12, symbol: "T" },
    { value: 1e15, symbol: "P" },
    { value: 1e18, symbol: "E" },
  ];
  const regexp = /\.0+$|(?<=\.[0-9]*[1-9])0+$/;
  const item = lookup.findLast((item) => num >= item.value);
  return item
    ? (num / item.value).toFixed(digits).replace(regexp, "").concat(item.symbol)
    : "0";
}

const initialState = { active: "1", total_button_presses: 0 };

const reducer: FrameReducer<State> = (state, action) => {
  return {
    total_button_presses: state.total_button_presses + 1,
    active: action.postBody?.untrustedData.buttonIndex
      ? String(action.postBody?.untrustedData.buttonIndex)
      : "1",
  };
};

const createQuery = ({ proposalId }: { proposalId: string }) =>
  gql(/* GraphQL */ `
  query {
    proposal(
      id: "${proposalId}"
    ) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      created
      scores
      scores_by_strategy
      scores_total
      scores_updated
      plugins
      network
      strategies {
        name
        network
        params
      }
      space {
        id
        name
        avatar
      }
      link
    }
  }
`);

const createVpQuery = ({
  proposalId,
  voter,
  space,
}: {
  proposalId: string;
  voter: string;
  space: string;
}) => {
  return gql(/* GraphQL */ `
        query {vp(
    proposal:"${proposalId}",
    voter: "${voter}",
    space:"${space}"
  ) {
    vp
    vp_by_strategy
    vp_state
  }
  }`);
};

const createUserQuery = ({ voter }: { voter: string }) => {
  return gql(/* GraphQL */ `
        query {
        user(id: "${voter}") {
      name
      about
      avatar
      created
    }
  }
`);
};

// This is a react server component only
export default async function Home({ searchParams }: NextServerPageProps) {
  const url = currentURL("/");
  const previousFrame = getPreviousFrame<State>(searchParams);
  const frameMessage = await getFrameMessage(previousFrame.postBody, {
    hubHttpUrl: DEFAULT_DEBUGGER_HUB_URL,
  });

  if (frameMessage && !frameMessage?.isValid) {
    throw new Error("Invalid frame payload");
  }

  // eslint-disable-next-line
  const [state, dispatch] = useFramesReducer<State>(
    reducer,
    initialState,
    previousFrame
  );

  const { proposalId, voter, voteChoice } = searchParams;

  const {
    proposal,
    vp,
    // user
  } = await getProposalAndVp({ proposalId, voter });

  // Here: do a server side side effect either sync or async (using await), such as minting an NFT if you want.
  // example: load the users credentials & check they have an NFT
  // console.log(proposal);
  // console.log("info: state is:", state);

  const maybeIpfsUrl = (url: string) => {
    if (url.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
    }
    return url;
  };

  const orgAvatar = proposal.space?.avatar
    ? maybeIpfsUrl(proposal.space.avatar)
    : undefined;

  const userAvatar = undefined;
  // user.avatar ? maybeIpfsUrl(user.avatar) : undefined;

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
        state={state}
        previousFrame={previousFrame}
      >
        {/* <FrameImage src="https://framesjs.org/og.png" /> */}
        <FrameImage aspectRatio="1.91:1">
          <div tw="w-full h-full bg-slate-800 text-white justify-center flex flex-col">
            <div tw="flex flex-row bg-slate-700 p-3 items-center">
              <div tw="flex flex-row">
                {orgAvatar && (
                  <img tw="w-12 h-12 rounded-full mr-3" src={orgAvatar} />
                )}
              </div>
              <div tw="flex grow-1">{proposal.space?.name}</div>
              <div tw="flex text-gray-400 text-[26px]">Snapshot vote</div>
            </div>
            <div tw="flex flex-col items-center grow-1">
              <div tw="flex flex-row">Proposal: {proposal.title}</div>
              <div tw="flex flex-col justify-center grow-1">
                <div tw="flex flex-col bg-slate-600 text-[28px]">
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">Delegate:</div>
                    <div tw="flex p-2">{voter}</div>
                  </div>
                  {/* <div tw="flex">
                    {userAvatar && <img src={userAvatar} tw="w-20 h-20" />}
                  </div> */}
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">Signaling:</div>
                    <div tw="flex p-2">{proposal.choices[voteChoice]}</div>
                  </div>
                  <div tw="flex flex-col">
                    <div tw="flex bg-slate-900">My voting power:</div>
                    <div tw="flex p-2">{nFormatter(vp.vp!, 2)}</div>
                  </div>
                </div>
              </div>

              <div tw="flex flex-row text-[30px]">Current results:</div>

              <div id="choice container" tw="flex flex-col w-3/5 mb-2">
                {/* Each choice gets its own row */}
                {proposal.choices.map((choice, i) => {
                  const score =
                    (((proposal.scores![i] as number) || 0) /
                      proposal.scores_total!) *
                    100;
                  return (
                    <div
                      tw="flex flex-row items-center w-full text-[26px] justify-between"
                      key={choice}
                    >
                      <div tw="flex flex-row grow-1">{choice}</div>
                      <div tw="flex w-[200px] h-[10px] bg-gray-700">
                        <div
                          tw={`flex flex-row bg-gray-200 w-[${Math.floor(
                            score
                          )}%]`}
                        ></div>
                      </div>
                      <div tw={`flex flex-row w-[40px] ml-2`}>
                        {score.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* <div tw="flex flex-row">
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
            )} */}
          </div>
        </FrameImage>
        <FrameInput text="put some text here" />
        <FrameButton>
          {state?.active === "1" ? "Active" : "Inactive"}
        </FrameButton>
        <FrameButton>
          {state?.active === "2" ? "Active" : "Inactive"}
        </FrameButton>
        <FrameButton action="link" target={proposal.link as string}>
          View on Snapshot
        </FrameButton>
      </FrameContainer>
    </div>
  );
}

async function getProposalAndVp({
  proposalId,
  voter,
}: {
  proposalId: string;
  voter: string;
}) {
  const client = createApolloClient();
  const { data } = (await client.query({
    query: createQuery({ proposalId }),
  })) as ApolloQueryResult<{ proposal: Proposal }>;
  const { data: vpData } = (await client.query({
    query: createVpQuery({
      proposalId,
      voter,
      space: data.proposal!.space!.id,
    }),
  })) as ApolloQueryResult<{ vp: Vp }>;
  const { data: userData } = (await client.query({
    query: createUserQuery({ voter }),
  })) as ApolloQueryResult<{ user: User }>;
  return {
    proposal: data.proposal,
    vp: vpData.vp,
    // user: userData.user,
  };
}
