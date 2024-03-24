import { ApolloClient, InMemoryCache } from "@apollo/client";

const createApolloClient = () => {
  return new ApolloClient({
    uri: "https://hub.snapshot.org/graphql",
    cache: new InMemoryCache(),
  });
};

export default createApolloClient;
